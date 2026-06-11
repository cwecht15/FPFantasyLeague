/**
 * League domain services shared by Server Actions and RSC pages: membership
 * lookups + authorization guards, league creation (league + settings + the
 * commissioner's team in one transaction), and invite-code join.
 */

import { and, eq } from "drizzle-orm";
import { randomBytes } from "crypto";

import { db } from "@/lib/db";
import {
  leagueMembers,
  leagues,
  leagueSettings,
  teams,
} from "@/lib/db/schema";
import { defaultLeagueSettings } from "@/lib/leagues/settings";

export type League = typeof leagues.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type LeagueSettingsRow = typeof leagueSettings.$inferSelect;

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "league"}-${randomBytes(3).toString("hex")}`;
}

export function newInviteCode(): string {
  return randomBytes(6).toString("hex"); // 12 chars, easy to paste
}

export async function getLeagueBySlug(slug: string): Promise<League | null> {
  const [league] = await db.select().from(leagues).where(eq(leagues.slug, slug)).limit(1);
  return league ?? null;
}

export async function getMembership(
  leagueId: number,
  userId: string,
): Promise<LeagueMember | null> {
  const [m] = await db
    .select()
    .from(leagueMembers)
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
    .limit(1);
  return m ?? null;
}

export async function getMyTeam(leagueId: number, userId: string): Promise<Team | null> {
  const [t] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.leagueId, leagueId), eq(teams.ownerUserId, userId)))
    .limit(1);
  return t ?? null;
}

/** League + membership for an authorized page load; null = not a member. */
export async function getLeagueForUser(
  slug: string,
  userId: string,
): Promise<{ league: League; member: LeagueMember; myTeam: Team | null } | null> {
  const league = await getLeagueBySlug(slug);
  if (!league) return null;
  const member = await getMembership(league.id, userId);
  if (!member) return null;
  const myTeam = await getMyTeam(league.id, userId);
  return { league, member, myTeam };
}

export function isCommissioner(member: LeagueMember): boolean {
  return member.role === "commissioner";
}

export async function getSettings(leagueId: number): Promise<LeagueSettingsRow> {
  const [row] = await db
    .select()
    .from(leagueSettings)
    .where(eq(leagueSettings.leagueId, leagueId))
    .limit(1);
  if (!row) throw new Error(`league_settings missing for league ${leagueId}`);
  return row;
}

export async function createLeague(opts: {
  name: string;
  season: number;
  numTeams: number;
  scoringPreset: string;
  teamName: string;
  commissionerUserId: string;
}): Promise<League> {
  const settings = defaultLeagueSettings(opts.scoringPreset);
  return db.transaction(async (tx) => {
    const [league] = await tx
      .insert(leagues)
      .values({
        name: opts.name,
        slug: slugify(opts.name),
        season: opts.season,
        numTeams: opts.numTeams,
        commissionerUserId: opts.commissionerUserId,
        inviteCode: newInviteCode(),
      })
      .returning();

    await tx.insert(leagueSettings).values({
      leagueId: league.id,
      rosterTemplate: settings.rosterTemplate,
      scoringRules: settings.scoringRules,
      draftConfig: settings.draftConfig,
      waiverConfig: settings.waiverConfig,
      playoffConfig: settings.playoffConfig,
    });

    await tx.insert(leagueMembers).values({
      leagueId: league.id,
      userId: opts.commissionerUserId,
      role: "commissioner",
    });

    await tx.insert(teams).values({
      leagueId: league.id,
      ownerUserId: opts.commissionerUserId,
      name: opts.teamName,
    });

    return league;
  });
}

export async function joinLeague(opts: {
  inviteCode: string;
  teamName: string;
  userId: string;
}): Promise<{ league?: League; error?: string }> {
  const [league] = await db
    .select()
    .from(leagues)
    .where(eq(leagues.inviteCode, opts.inviteCode.trim()))
    .limit(1);
  if (!league) return { error: "No league found for that invite code" };
  if (league.status !== "setup" && league.status !== "drafting") {
    return { error: "That league is no longer accepting new teams" };
  }

  const existing = await getMembership(league.id, opts.userId);
  if (existing) return { league }; // already in — treat as success

  const memberTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.leagueId, league.id));
  if (memberTeams.length >= league.numTeams) {
    return { error: "That league is full" };
  }

  await db.transaction(async (tx) => {
    await tx.insert(leagueMembers).values({
      leagueId: league.id,
      userId: opts.userId,
      role: "manager",
    });
    await tx.insert(teams).values({
      leagueId: league.id,
      ownerUserId: opts.userId,
      name: opts.teamName,
    });
  });
  return { league };
}

export async function listMyLeagues(userId: string): Promise<League[]> {
  const rows = await db
    .select({ league: leagues })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagueMembers.leagueId, leagues.id))
    .where(eq(leagueMembers.userId, userId))
    .orderBy(leagues.createdAt);
  return rows.map((r) => r.league);
}

export async function listTeams(leagueId: number): Promise<Team[]> {
  return db.select().from(teams).where(eq(teams.leagueId, leagueId)).orderBy(teams.id);
}
