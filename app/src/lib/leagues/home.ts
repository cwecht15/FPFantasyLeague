/** Data assembly for the League Home dashboard (Game Day screen #1). */

import { and, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import { matchups, standings, teams } from "@/lib/db/schema";
import type { League, Team } from "@/lib/leagues/service";
import { getSettings } from "@/lib/leagues/service";
import { getLineupView } from "@/lib/lineups/service";
import { leagueCurrentWeek } from "@/lib/nfl/week";

export interface StandingRow {
  teamId: number;
  name: string;
  rank: number;
  w: number;
  l: number;
  t: number;
  pf: number;
  pa: number;
}

export interface HomeData {
  week: number;
  standings: StandingRow[];
  me: StandingRow | null;
  /** This week's matchup from MY perspective (null = bye/no schedule). */
  matchup: {
    id: number;
    oppName: string;
    oppRow: StandingRow | null;
    myPoints: number | null;
    oppPoints: number | null;
  } | null;
  lineup: { filled: number; total: number; firstLock: Date | null };
  lastWeek: {
    week: number;
    won: boolean;
    tie: boolean;
    myPoints: number;
    oppPoints: number;
    oppName: string;
  } | null;
  /** Playoff shape, for the league-home race banner. */
  playoffTeams: number;
  playoffStartWeek: number;
  playoffEndWeek: number;
  /** First-round byes (field padded to the next power of two). */
  playoffByes: number;
}

export async function getHomeData(league: League, myTeam: Team): Promise<HomeData> {
  const week = await leagueCurrentWeek(league.id, league.season);

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, league.id));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

  const standRows = await db
    .select()
    .from(standings)
    .where(and(eq(standings.leagueId, league.id), eq(standings.season, league.season)))
    .orderBy(standings.rank);
  const table: StandingRow[] = standRows.map((s) => ({
    teamId: s.teamId,
    name: teamName.get(s.teamId) ?? "?",
    rank: s.rank ?? 0,
    w: s.wins,
    l: s.losses,
    t: s.ties,
    pf: s.pointsFor,
    pa: s.pointsAgainst,
  }));
  const me = table.find((r) => r.teamId === myTeam.id) ?? null;

  const myMatch = (w: number) =>
    db
      .select()
      .from(matchups)
      .where(
        and(
          eq(matchups.leagueId, league.id),
          eq(matchups.season, league.season),
          eq(matchups.week, w),
          or(eq(matchups.homeTeamId, myTeam.id), eq(matchups.awayTeamId, myTeam.id)),
        ),
      )
      .limit(1)
      .then((r) => r[0] ?? null);

  const m = await myMatch(week);
  let matchup: HomeData["matchup"] = null;
  if (m && m.awayTeamId) {
    const home = m.homeTeamId === myTeam.id;
    const oppId = home ? m.awayTeamId : m.homeTeamId;
    matchup = {
      id: m.id,
      oppName: teamName.get(oppId) ?? "?",
      oppRow: table.find((r) => r.teamId === oppId) ?? null,
      myPoints: home ? m.homePoints : m.awayPoints,
      oppPoints: home ? m.awayPoints : m.homePoints,
    };
  }

  const settings = await getSettings(league.id);
  const view = await getLineupView(
    league.id,
    myTeam.id,
    league.season,
    week,
    settings.rosterTemplate,
  );
  const starters = view.slots.filter((s) => s.slot !== "BENCH" && s.slot !== "IR");
  const kicks = starters
    .filter((s) => s.gsisId && s.kickoffAt && !s.locked)
    .map((s) => s.kickoffAt!.getTime());
  const lineup = {
    filled: starters.filter((s) => s.gsisId).length,
    total: starters.length,
    firstLock: kicks.length ? new Date(Math.min(...kicks)) : null,
  };

  let lastWeek: HomeData["lastWeek"] = null;
  if (week > 1) {
    const lm = await myMatch(week - 1);
    if (lm && lm.awayTeamId && lm.status === "final" && lm.homePoints !== null && lm.awayPoints !== null) {
      const home = lm.homeTeamId === myTeam.id;
      const oppId = home ? lm.awayTeamId : lm.homeTeamId;
      lastWeek = {
        week: week - 1,
        won: lm.winnerTeamId === myTeam.id,
        tie: lm.isTie,
        myPoints: home ? lm.homePoints : lm.awayPoints,
        oppPoints: home ? lm.awayPoints : lm.homePoints,
        oppName: teamName.get(oppId) ?? "?",
      };
    }
  }

  // Playoff shape for the race banner. The field can't exceed the league.
  const pc = (await getSettings(league.id)).playoffConfig;
  const playoffTeams = Math.min(pc.teams, teamRows.length);
  const rounds = Math.ceil(Math.log2(Math.max(2, playoffTeams)));
  const playoffByes = 2 ** rounds - playoffTeams;

  return {
    week,
    standings: table,
    me,
    matchup,
    lineup,
    lastWeek,
    playoffTeams,
    playoffStartWeek: pc.startWeek,
    playoffEndWeek: pc.startWeek + rounds - 1,
    playoffByes,
  };
}
