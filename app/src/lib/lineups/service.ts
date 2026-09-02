/**
 * Lineup domain: materialize a team's weekly lineup from the league's roster
 * template, resolve per-player kickoff lock times, and validate slot edits.
 *
 * Lock rule (per plan): a slot is editable iff now < kickoff of the player's
 * NFL game that week (players with no game / unknown kickoff are editable all
 * week). Both the incoming and outgoing player must be unlocked.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  lineups,
  lineupSlots,
  nflGames,
  players,
  playerWeekGames,
  playerWeekScores,
  rosterEntries,
} from "@/lib/db/schema";
import { SLOT_ELIGIBILITY, type RosterSlot, type RosterTemplate } from "@/lib/leagues/settings";

const REG = "REG";

export interface SlotView {
  slotId: number;
  slot: string;
  slotIndex: number;
  gsisId: string | null;
  playerName: string | null;
  position: string | null;
  nflTeam: string | null;
  kickoffAt: Date | null;
  locked: boolean;
  points: number | null; // league-scored points for this week (null = not scored)
}

export interface RosteredPlayer {
  gsisId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  kickoffAt: Date | null;
  locked: boolean;
  inSlot: string | null; // which lineup slot currently holds them
  points: number | null;
}

/** Ensure the lineup row + one row per template slot exist; returns lineup id. */
export async function ensureLineup(
  teamId: number,
  season: number,
  week: number,
  template: RosterTemplate,
): Promise<number> {
  return db.transaction(async (tx) => {
    let [lineup] = await tx
      .select()
      .from(lineups)
      .where(and(eq(lineups.teamId, teamId), eq(lineups.season, season), eq(lineups.week, week)))
      .limit(1);
    if (!lineup) {
      [lineup] = await tx
        .insert(lineups)
        .values({ teamId, season, week })
        .onConflictDoNothing()
        .returning();
      if (!lineup) {
        [lineup] = await tx
          .select()
          .from(lineups)
          .where(and(eq(lineups.teamId, teamId), eq(lineups.season, season), eq(lineups.week, week)))
          .limit(1);
      }
    }

    const existing = await tx
      .select({ slot: lineupSlots.slot, slotIndex: lineupSlots.slotIndex })
      .from(lineupSlots)
      .where(eq(lineupSlots.lineupId, lineup.id));
    const have = new Set(existing.map((s) => `${s.slot}#${s.slotIndex}`));

    const wanted: { slot: string; slotIndex: number }[] = [];
    for (const def of template.slots) {
      for (let i = 0; i < def.count; i++) wanted.push({ slot: def.slot, slotIndex: i });
    }
    const missing = wanted.filter((w) => !have.has(`${w.slot}#${w.slotIndex}`));
    if (missing.length) {
      await tx
        .insert(lineupSlots)
        .values(missing.map((m) => ({ lineupId: lineup.id, ...m })))
        .onConflictDoNothing();
    }
    return lineup.id;
  });
}

/** Kickoff time per player for a week. player_week_games rows arrive with the
 *  weekly stats push (after the games), so for the live week we fall back to
 *  the season schedule: the player's NFL team's game that week. Without the
 *  fallback, nothing would lock at kickoff until Tuesday. */
export async function kickoffMap(
  gsisIds: string[],
  season: number,
  week: number,
): Promise<Map<string, Date | null>> {
  if (gsisIds.length === 0) return new Map();
  const rows = await db
    .select({ gsisId: playerWeekGames.gsisId, kickoffAt: nflGames.kickoffAt })
    .from(playerWeekGames)
    .innerJoin(nflGames, eq(playerWeekGames.gameId, nflGames.gameId))
    .where(
      and(
        inArray(playerWeekGames.gsisId, gsisIds),
        eq(playerWeekGames.season, season),
        eq(playerWeekGames.seasonType, REG),
        eq(playerWeekGames.week, week),
      ),
    );
  const map = new Map(rows.map((r) => [r.gsisId, r.kickoffAt]));

  const missing = gsisIds.filter((id) => !map.has(id));
  if (missing.length) {
    const teamRows = await db
      .select({ gsisId: players.gsisId, nflTeam: players.nflTeam })
      .from(players)
      .where(inArray(players.gsisId, missing));
    const games = await db
      .select({ home: nflGames.homeTeam, away: nflGames.awayTeam, kickoffAt: nflGames.kickoffAt })
      .from(nflGames)
      .where(
        and(eq(nflGames.season, season), eq(nflGames.seasonType, REG), eq(nflGames.week, week)),
      );
    const teamKick = new Map<string, Date | null>();
    for (const g of games) {
      teamKick.set(g.home, g.kickoffAt);
      teamKick.set(g.away, g.kickoffAt);
    }
    for (const t of teamRows) {
      if (t.nflTeam && teamKick.has(t.nflTeam)) map.set(t.gsisId, teamKick.get(t.nflTeam)!);
    }
  }
  return map;
}

export function isLocked(kickoffAt: Date | null | undefined, now = new Date()): boolean {
  return kickoffAt != null && kickoffAt.getTime() <= now.getTime();
}

/** Scored points per player for a league-week. */
async function pointsMap(
  leagueId: number,
  gsisIds: string[],
  season: number,
  week: number,
): Promise<Map<string, number>> {
  if (gsisIds.length === 0) return new Map();
  const rows = await db
    .select({ gsisId: playerWeekScores.gsisId, points: playerWeekScores.fantasyPoints })
    .from(playerWeekScores)
    .where(
      and(
        eq(playerWeekScores.leagueId, leagueId),
        inArray(playerWeekScores.gsisId, gsisIds),
        eq(playerWeekScores.season, season),
        eq(playerWeekScores.seasonType, REG),
        eq(playerWeekScores.week, week),
      ),
    );
  return new Map(rows.map((r) => [r.gsisId, r.points]));
}

/** Autofill an all-empty lineup so slots are never blank by default:
 *  copy last week's arrangement where players are still rostered, then fill
 *  remaining starter slots from the roster in draft/acquisition order
 *  (roster_entries.id ascending = pick order), bench/IR last. */
export async function fillEmptyLineup(
  teamId: number,
  season: number,
  week: number,
  template: RosterTemplate,
  lineupId: number,
): Promise<void> {
  const slotRows = await db
    .select()
    .from(lineupSlots)
    .where(eq(lineupSlots.lineupId, lineupId));
  if (slotRows.length === 0 || slotRows.some((s) => s.gsisId !== null)) return;

  const roster = await db
    .select({ gsisId: rosterEntries.gsisId, position: players.position, entryId: rosterEntries.id })
    .from(rosterEntries)
    .innerJoin(players, eq(players.gsisId, rosterEntries.gsisId))
    .where(and(eq(rosterEntries.teamId, teamId), isNull(rosterEntries.droppedAt)))
    .orderBy(rosterEntries.id); // acquisition order ≈ draft order
  if (roster.length === 0) return;

  const assigned = new Map<number, string>(); // slotId -> gsisId
  const used = new Set<string>();

  // 1) inherit last week's arrangement (same slot/index) where still rostered
  if (week > 1) {
    const [prev] = await db
      .select({ id: lineups.id })
      .from(lineups)
      .where(and(eq(lineups.teamId, teamId), eq(lineups.season, season), eq(lineups.week, week - 1)))
      .limit(1);
    if (prev) {
      const prevSlots = await db
        .select()
        .from(lineupSlots)
        .where(eq(lineupSlots.lineupId, prev.id));
      const stillRostered = new Set(roster.map((r) => r.gsisId));
      for (const ps of prevSlots) {
        if (!ps.gsisId || !stillRostered.has(ps.gsisId) || used.has(ps.gsisId)) continue;
        const target = slotRows.find(
          (s) => s.slot === ps.slot && s.slotIndex === ps.slotIndex,
        );
        if (target && !assigned.has(target.id)) {
          assigned.set(target.id, ps.gsisId);
          used.add(ps.gsisId);
        }
      }
    }
  }

  // 2) fill remaining starters by draft order, respecting eligibility
  const order = new Map(template.slots.map((d, i) => [d.slot, i]));
  const sortedSlots = [...slotRows].sort(
    (a, b) =>
      (order.get(a.slot as RosterSlot) ?? 99) - (order.get(b.slot as RosterSlot) ?? 99) ||
      a.slotIndex - b.slotIndex,
  );
  for (const slot of sortedSlots) {
    if (assigned.has(slot.id)) continue;
    if (slot.slot === "BENCH" || slot.slot === "IR") continue;
    const allowed = eligiblePositions(template, slot.slot);
    const candidate = roster.find(
      (r) => !used.has(r.gsisId) && (allowed.length === 0 || allowed.includes(r.position)),
    );
    if (candidate) {
      assigned.set(slot.id, candidate.gsisId);
      used.add(candidate.gsisId);
    }
  }

  // 3) leftovers to bench/IR
  const leftovers = roster.filter((r) => !used.has(r.gsisId));
  for (const slot of sortedSlots) {
    if (assigned.has(slot.id)) continue;
    if (slot.slot !== "BENCH" && slot.slot !== "IR") continue;
    const next = leftovers.shift();
    if (!next) break;
    assigned.set(slot.id, next.gsisId);
  }

  for (const [slotId, gsisId] of assigned) {
    await db.update(lineupSlots).set({ gsisId }).where(eq(lineupSlots.id, slotId));
  }
}

/** Read-only lineup view for anonymous spectator pages. Unlike getLineupView
 *  it NEVER writes: no ensureLineup/fillEmptyLineup — if the lineup (or a
 *  template slot) doesn't exist yet, the missing slots render empty instead of
 *  being materialized. Anonymous GETs must not touch the database. */
export async function getLineupViewReadOnly(
  leagueId: number,
  teamId: number,
  season: number,
  week: number,
  template: RosterTemplate,
): Promise<{ slots: SlotView[] }> {
  const [lineup] = await db
    .select({ id: lineups.id })
    .from(lineups)
    .where(and(eq(lineups.teamId, teamId), eq(lineups.season, season), eq(lineups.week, week)))
    .limit(1);

  const slotRows = lineup
    ? await db
        .select({
          slotId: lineupSlots.id,
          slot: lineupSlots.slot,
          slotIndex: lineupSlots.slotIndex,
          gsisId: lineupSlots.gsisId,
          playerName: players.displayName,
          position: players.position,
          nflTeam: players.nflTeam,
        })
        .from(lineupSlots)
        .leftJoin(players, eq(lineupSlots.gsisId, players.gsisId))
        .where(eq(lineupSlots.lineupId, lineup.id))
        .orderBy(lineupSlots.slot, lineupSlots.slotIndex)
    : [];

  // Pad to the template so both sides of a matchup always show every slot.
  const have = new Set(slotRows.map((s) => `${s.slot}#${s.slotIndex}`));
  const padded = [...slotRows];
  let synthetic = -1;
  for (const def of template.slots) {
    for (let i = 0; i < def.count; i++) {
      if (have.has(`${def.slot}#${i}`)) continue;
      padded.push({
        slotId: synthetic--,
        slot: def.slot,
        slotIndex: i,
        gsisId: null,
        playerName: null,
        position: null,
        nflTeam: null,
      });
    }
  }

  padded.sort((a, b) => a.slot.localeCompare(b.slot) || a.slotIndex - b.slotIndex);

  const ids = padded.map((s) => s.gsisId).filter((x): x is string => !!x);
  const kicks = await kickoffMap(ids, season, week);
  const pts = await pointsMap(leagueId, ids, season, week);
  const slots: SlotView[] = padded.map((s) => {
    const kickoffAt = s.gsisId ? (kicks.get(s.gsisId) ?? null) : null;
    return {
      ...s,
      kickoffAt,
      locked: isLocked(kickoffAt),
      points: s.gsisId ? (pts.get(s.gsisId) ?? null) : null,
    };
  });
  return { slots };
}

/** Full lineup view + the team's rostered players for the editor. */
export async function getLineupView(
  leagueId: number,
  teamId: number,
  season: number,
  week: number,
  template: RosterTemplate,
): Promise<{ lineupId: number; slots: SlotView[]; roster: RosteredPlayer[] }> {
  const lineupId = await ensureLineup(teamId, season, week, template);
  await fillEmptyLineup(teamId, season, week, template, lineupId);

  const slotRows = await db
    .select({
      slotId: lineupSlots.id,
      slot: lineupSlots.slot,
      slotIndex: lineupSlots.slotIndex,
      gsisId: lineupSlots.gsisId,
      playerName: players.displayName,
      position: players.position,
      nflTeam: players.nflTeam,
    })
    .from(lineupSlots)
    .leftJoin(players, eq(lineupSlots.gsisId, players.gsisId))
    .where(eq(lineupSlots.lineupId, lineupId))
    .orderBy(lineupSlots.slot, lineupSlots.slotIndex);

  const rosterRows = await db
    .select({
      gsisId: rosterEntries.gsisId,
      name: players.displayName,
      position: players.position,
      nflTeam: players.nflTeam,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(rosterEntries.gsisId, players.gsisId))
    .where(and(eq(rosterEntries.teamId, teamId), isNull(rosterEntries.droppedAt)))
    .orderBy(players.position, players.displayName);

  const allIds = [
    ...new Set([
      ...slotRows.map((s) => s.gsisId).filter((x): x is string => !!x),
      ...rosterRows.map((r) => r.gsisId),
    ]),
  ];
  const kicks = await kickoffMap(allIds, season, week);
  const pts = await pointsMap(leagueId, allIds, season, week);
  const slotByPlayer = new Map(
    slotRows.filter((s) => s.gsisId).map((s) => [s.gsisId as string, `${s.slot} ${s.slotIndex + 1}`]),
  );

  const slots: SlotView[] = slotRows.map((s) => {
    const kickoffAt = s.gsisId ? (kicks.get(s.gsisId) ?? null) : null;
    return {
      ...s,
      kickoffAt,
      locked: isLocked(kickoffAt),
      points: s.gsisId ? (pts.get(s.gsisId) ?? null) : null,
    };
  });

  const roster: RosteredPlayer[] = rosterRows.map((r) => {
    const kickoffAt = kicks.get(r.gsisId) ?? null;
    return {
      ...r,
      kickoffAt,
      locked: isLocked(kickoffAt),
      inSlot: slotByPlayer.get(r.gsisId) ?? null,
      points: pts.get(r.gsisId) ?? null,
    };
  });

  // Order slots in template order (QB first … BENCH/IR last).
  const order = new Map(template.slots.map((d, i) => [d.slot, i]));
  slots.sort(
    (a, b) =>
      (order.get(a.slot as RosterSlot) ?? 99) - (order.get(b.slot as RosterSlot) ?? 99) ||
      a.slotIndex - b.slotIndex,
  );

  return { lineupId, slots, roster };
}

/** Positions allowed in a slot, honoring template overrides. */
export function eligiblePositions(template: RosterTemplate, slot: string): string[] {
  const def = template.slots.find((d) => d.slot === slot);
  if (def?.eligible?.length) return def.eligible;
  const base = SLOT_ELIGIBILITY[slot as RosterSlot];
  return base ?? [];
}

export interface SetSlotResult {
  error: string | null;
}

export interface SaveLineupResult {
  error: string | null;
  /** Slots that could not be applied (locked / ineligible / not rostered). */
  skipped: string[];
}

/** Apply a whole-lineup edit in one shot. Locked slots and locked players are
 *  left untouched (reported in `skipped`); a player desired in two slots keeps
 *  the first (template-order) one. */
export async function saveLineup(opts: {
  leagueId: number;
  teamId: number;
  season: number;
  week: number;
  template: RosterTemplate;
  desired: Map<number, string | null>; // slotId -> gsisId | null
}): Promise<SaveLineupResult> {
  const { teamId, season, week, template, desired } = opts;
  const lineupId = await ensureLineup(teamId, season, week, template);

  const slotRows = await db
    .select()
    .from(lineupSlots)
    .where(eq(lineupSlots.lineupId, lineupId));
  const slotById = new Map(slotRows.map((s) => [s.id, s]));

  const roster = await db
    .select({ gsisId: rosterEntries.gsisId, position: players.position })
    .from(rosterEntries)
    .innerJoin(players, eq(players.gsisId, rosterEntries.gsisId))
    .where(and(eq(rosterEntries.teamId, teamId), isNull(rosterEntries.droppedAt)));
  const rosterPos = new Map(roster.map((r) => [r.gsisId, r.position]));

  const involved = new Set<string>();
  for (const s of slotRows) if (s.gsisId) involved.add(s.gsisId);
  for (const g of desired.values()) if (g) involved.add(g);
  const kicks = await kickoffMap([...involved], season, week);

  const order = new Map(template.slots.map((d, i) => [d.slot, i]));
  const orderedSlots = [...slotRows].sort(
    (a, b) =>
      (order.get(a.slot as RosterSlot) ?? 99) - (order.get(b.slot as RosterSlot) ?? 99) ||
      a.slotIndex - b.slotIndex,
  );

  const skipped: string[] = [];
  const updates = new Map<number, string | null>();
  const claimed = new Set<string>();
  const label = (s: (typeof slotRows)[number]) =>
    `${s.slot}${s.slotIndex > 0 ? ` ${s.slotIndex + 1}` : ""}`;

  for (const slot of orderedSlots) {
    if (!desired.has(slot.id)) {
      if (slot.gsisId) claimed.add(slot.gsisId); // untouched slot keeps its player
      continue;
    }
    const want = desired.get(slot.id) ?? null;
    const current = slot.gsisId;
    if (want === current) {
      if (current) claimed.add(current);
      continue;
    }
    if (isLocked(kicks.get(current ?? ""))) {
      skipped.push(`${label(slot)} (locked)`);
      if (current) claimed.add(current);
      continue;
    }
    if (want === null) {
      updates.set(slot.id, null);
      continue;
    }
    if (isLocked(kicks.get(want))) {
      skipped.push(`${label(slot)} (player locked)`);
      if (current) claimed.add(current);
      continue;
    }
    if (!rosterPos.has(want)) {
      skipped.push(`${label(slot)} (not on roster)`);
      if (current) claimed.add(current);
      continue;
    }
    if (slot.slot !== "BENCH" && slot.slot !== "IR") {
      const allowed = eligiblePositions(template, slot.slot);
      if (allowed.length > 0 && !allowed.includes(rosterPos.get(want)!)) {
        skipped.push(`${label(slot)} (${rosterPos.get(want)} not eligible)`);
        if (current) claimed.add(current);
        continue;
      }
    }
    if (claimed.has(want)) {
      skipped.push(`${label(slot)} (player already placed)`);
      updates.set(slot.id, null);
      continue;
    }
    claimed.add(want);
    updates.set(slot.id, want);
  }

  // A player moving between slots: clear their old (unlocked) slot if it
  // wasn't explicitly reassigned.
  for (const slot of orderedSlots) {
    if (updates.has(slot.id) || !slot.gsisId) continue;
    const movedElsewhere = [...updates.values()].includes(slot.gsisId);
    if (movedElsewhere && !isLocked(kicks.get(slot.gsisId))) {
      updates.set(slot.id, null);
    }
  }

  await db.transaction(async (tx) => {
    for (const [slotId, gsisId] of updates) {
      if (!slotById.has(slotId)) continue;
      await tx.update(lineupSlots).set({ gsisId }).where(eq(lineupSlots.id, slotId));
    }
  });

  return { error: null, skipped };
}

/** Place `gsisId` (or null to clear) into a slot, enforcing ownership,
 *  eligibility, and kickoff locks. Clears the player's previous slot. */
export async function setLineupSlot(opts: {
  leagueId: number;
  teamId: number;
  season: number;
  week: number;
  template: RosterTemplate;
  slotId: number;
  gsisId: string | null;
}): Promise<SetSlotResult> {
  const { leagueId, teamId, season, week, template, slotId, gsisId } = opts;
  const lineupId = await ensureLineup(teamId, season, week, template);

  const [slot] = await db
    .select()
    .from(lineupSlots)
    .where(and(eq(lineupSlots.id, slotId), eq(lineupSlots.lineupId, lineupId)))
    .limit(1);
  if (!slot) return { error: "Slot not found" };

  const idsToCheck = [slot.gsisId, gsisId].filter((x): x is string => !!x);
  const kicks = await kickoffMap(idsToCheck, season, week);

  if (slot.gsisId && isLocked(kicks.get(slot.gsisId))) {
    return { error: "That slot is locked — the player's game has started" };
  }

  if (gsisId === null) {
    await db.update(lineupSlots).set({ gsisId: null }).where(eq(lineupSlots.id, slot.id));
    return { error: null };
  }

  if (isLocked(kicks.get(gsisId))) {
    return { error: "That player is locked — their game has started" };
  }

  // Ownership: player must be on this team's active roster.
  const [owned] = await db
    .select({ id: rosterEntries.id })
    .from(rosterEntries)
    .where(
      and(
        eq(rosterEntries.teamId, teamId),
        eq(rosterEntries.gsisId, gsisId),
        isNull(rosterEntries.droppedAt),
      ),
    )
    .limit(1);
  if (!owned) return { error: "Player is not on your roster" };

  // Eligibility (BENCH/IR accept anyone).
  if (slot.slot !== "BENCH" && slot.slot !== "IR") {
    const [p] = await db
      .select({ position: players.position })
      .from(players)
      .where(eq(players.gsisId, gsisId))
      .limit(1);
    const allowed = eligiblePositions(template, slot.slot);
    if (!p || !allowed.includes(p.position)) {
      return { error: `${p?.position ?? "?"} is not eligible for ${slot.slot}` };
    }
  }

  await db.transaction(async (tx) => {
    // One slot per player: clear any other slot currently holding them.
    const [prev] = await tx
      .select()
      .from(lineupSlots)
      .where(and(eq(lineupSlots.lineupId, lineupId), eq(lineupSlots.gsisId, gsisId)))
      .limit(1);
    if (prev && prev.id !== slot.id) {
      await tx.update(lineupSlots).set({ gsisId: null }).where(eq(lineupSlots.id, prev.id));
    }
    await tx.update(lineupSlots).set({ gsisId }).where(eq(lineupSlots.id, slot.id));
  });
  return { error: null };
}
