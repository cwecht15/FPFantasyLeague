/**
 * Game-lock: the product's add/drop availability rule.
 *
 * A player is freely addable/droppable until their NFL team's game kicks off
 * for the week. From kickoff they are locked wherever they are — starting
 * lineup, bench, or free-agent pool — until waivers process at the next
 * Wednesday 3:00 AM ET boundary. Locked free agents can only be claimed via
 * FAAB bids; after the boundary everyone unclaimed is a free agent again.
 *
 * Locks are derived from the season schedule (nfl_games), not from
 * player_week_games, so they work during the live week before any stats push.
 */

import { and, eq, gte, isNotNull, lte } from "drizzle-orm";

import { db } from "@/lib/db";
import { nflGames } from "@/lib/db/schema";

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** UTC instant of `hourEt`:00 America/New_York on the given calendar date. */
function etHourUtc(year: number, monthIndex: number, day: number, hourEt: number): Date {
  // Guess EDT (UTC-4), then correct via Intl if the date is actually EST.
  const guess = new Date(Date.UTC(year, monthIndex, day, hourEt + 4, 0, 0));
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(guess),
  );
  const correction = ((hourEt - etHour + 12) % 24) - 12; // 0 in EDT, +1 in EST
  return new Date(guess.getTime() + correction * 3600 * 1000);
}

function weeklyEtCandidates(dow: number, hourEt: number, around: Date): Date[] {
  const out: Date[] = [];
  for (let d = -8; d <= 8; d++) {
    const probe = new Date(around.getTime() + d * 24 * 3600 * 1000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(probe);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    if (get("weekday") !== DOW_NAMES[dow]) continue;
    out.push(etHourUtc(Number(get("year")), Number(get("month")) - 1, Number(get("day")), hourEt));
  }
  return out;
}

/** Next weekly occurrence of `dow` at `hourEt` ET strictly after `after`. */
export function nextWeeklyEt(dow: number, hourEt: number, after = new Date()): Date {
  const next = weeklyEtCandidates(dow, hourEt, after)
    .filter((c) => c.getTime() > after.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return next ?? new Date(after.getTime() + 7 * 24 * 3600 * 1000);
}

/** Most recent weekly occurrence of `dow` at `hourEt` ET at or before `before`. */
export function lastWeeklyEt(dow: number, hourEt: number, before = new Date()): Date {
  const last = weeklyEtCandidates(dow, hourEt, before)
    .filter((c) => c.getTime() <= before.getTime())
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return last ?? new Date(before.getTime() - 7 * 24 * 3600 * 1000);
}

/** Waiver boundary: Wednesday 3:00 AM ET (config can override via
 *  processDow / processHourEt; older stored configs fall back here). */
export const WAIVER_DOW = 3;
export const WAIVER_HOUR_ET = 3;

/** NFL team codes whose game has kicked off inside the current waiver window
 *  (i.e. since the last Wednesday 3:00 AM ET). Players on these teams are
 *  game-locked right now. */
export async function lockedNflTeams(
  season: number,
  now = new Date(),
  dow = WAIVER_DOW,
  hourEt = WAIVER_HOUR_ET,
): Promise<Set<string>> {
  const windowStart = lastWeeklyEt(dow, hourEt, now);
  const rows = await db
    .select({ home: nflGames.homeTeam, away: nflGames.awayTeam })
    .from(nflGames)
    .where(
      and(
        eq(nflGames.season, season),
        eq(nflGames.seasonType, "REG"),
        isNotNull(nflGames.kickoffAt),
        gte(nflGames.kickoffAt, windowStart),
        lte(nflGames.kickoffAt, now),
      ),
    );
  const locked = new Set<string>();
  for (const r of rows) {
    locked.add(r.home);
    locked.add(r.away);
  }
  return locked;
}
