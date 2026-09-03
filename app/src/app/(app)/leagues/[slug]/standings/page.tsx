import { Fragment } from "react";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchups, standings, teams, users } from "@/lib/db/schema";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { playoffConfigSchema } from "@/lib/leagues/settings";
import { fmt1 } from "@/lib/format";

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const league = ctx.league;
  const myTeamId = ctx.myTeam?.id ?? null;

  const playoffCfg = playoffConfigSchema.safeParse(
    (await getSettings(league.id)).playoffConfig,
  );
  const cfg = playoffCfg.success ? playoffCfg.data : null;
  const cutLabel = "Playoff line";
  const startWeek = cfg?.startWeek ?? 15;

  // Every team always appears: standings rows exist only after the first
  // scored week, so preseason merges the team list with zeros.
  const teamRows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      draftPosition: teams.draftPosition,
      manager: users.displayName,
      managerName: users.name,
    })
    .from(teams)
    .leftJoin(users, eq(teams.ownerUserId, users.id))
    .where(eq(teams.leagueId, league.id));

  const sRows = await db
    .select()
    .from(standings)
    .where(and(eq(standings.leagueId, league.id), eq(standings.season, league.season)));
  const sByTeam = new Map(sRows.map((s) => [s.teamId, s]));

  const zero = { wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0, rank: null };
  const rows = teamRows
    .map((t) => ({ ...t, s: sByTeam.get(t.teamId) ?? { ...zero, teamId: t.teamId } }))
    .sort((a, b) => {
      if (a.s.rank !== null && b.s.rank !== null) return a.s.rank - b.s.rank;
      if (a.s.rank !== null) return -1;
      if (b.s.rank !== null) return 1;
      // Preseason: draft order, then name.
      return (
        (a.draftPosition ?? 99) - (b.draftPosition ?? 99) ||
        a.teamName.localeCompare(b.teamName)
      );
    });

  // The field can't exceed the league — a 5-team league has no cut line.
  const cutAfter = Math.min(cfg?.teams ?? 6, rows.length);
  const lastWeek = startWeek + Math.ceil(Math.log2(Math.max(2, cutAfter))) - 1;
  const subCopy =
    cutAfter >= rows.length
      ? `Every team makes the bracket (${rows.length}-team league) — seeded by wins, points for breaks ties. Weeks ${startWeek}–${lastWeek}.`
      : `Top ${cutAfter} by wins make the playoffs — points for breaks ties. Bracket runs weeks ${startWeek}–${lastWeek}.`;

  const anyScored = sRows.length > 0;
  const leader = rows[0]?.s;
  const gamesBack = (s: (typeof rows)[number]["s"]): string => {
    if (!anyScored || !leader) return "—";
    const gb = (leader.wins - s.wins + (s.losses - leader.losses)) / 2;
    return gb <= 0 ? "—" : gb.toFixed(gb % 1 === 0 ? 0 : 1);
  };

  // Final matchups → streaks, last-5 strips, and the weekly scoring matrix.
  const finals = await db
    .select()
    .from(matchups)
    .where(
      and(
        eq(matchups.leagueId, league.id),
        eq(matchups.season, league.season),
        eq(matchups.status, "final"),
      ),
    )
    .orderBy(matchups.week);

  type Outcome = "W" | "L" | "T";
  type Cell = { pts: number; result: Outcome };
  const byTeamWeek = new Map<number, Map<number, Cell>>();
  const weeksSet = new Set<number>();
  for (const m of finals) {
    if (!m.awayTeamId || m.homePoints === null || m.awayPoints === null) continue;
    weeksSet.add(m.week);
    const put = (teamId: number, pts: number, result: Outcome) => {
      const inner = byTeamWeek.get(teamId) ?? new Map<number, Cell>();
      inner.set(m.week, { pts, result });
      byTeamWeek.set(teamId, inner);
    };
    const outcome = (teamId: number): Outcome =>
      m.isTie ? "T" : m.winnerTeamId === teamId ? "W" : "L";
    put(m.homeTeamId, m.homePoints, outcome(m.homeTeamId));
    put(m.awayTeamId, m.awayPoints, outcome(m.awayTeamId));
  }
  const weeks = [...weeksSet].sort((a, b) => a - b);
  const weekHigh = new Map<number, number>();
  for (const w of weeks) {
    let high = -Infinity;
    for (const inner of byTeamWeek.values()) {
      const c = inner.get(w);
      if (c && c.pts > high) high = c.pts;
    }
    weekHigh.set(w, high);
  }

  const results = (teamId: number): Outcome[] => {
    const inner = byTeamWeek.get(teamId);
    if (!inner) return [];
    return [...inner.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c.result);
  };
  const last5 = (teamId: number) => results(teamId).slice(-5);
  const streak = (teamId: number): string => {
    const rs = results(teamId);
    if (rs.length === 0) return "—";
    const latest = rs[rs.length - 1];
    let n = 0;
    for (let i = rs.length - 1; i >= 0 && rs[i] === latest; i--) n++;
    return `${latest}${n}`;
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">
            {league.name} · {league.season}
          </div>
          <h1 className="display">Standings</h1>
          <div className="sub">
            {subCopy}
            {!anyScored && " Records start with the Week 1 results."}
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="empty">No teams in this league yet.</p>
      ) : (
        <div className="panel">
          <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th>Team</th>
                <th>Manager</th>
                <th className="r">W</th>
                <th className="r">L</th>
                <th className="r">T</th>
                <th className="r" title="Points for">
                  PF
                </th>
                <th className="r" title="Points against">
                  PA
                </th>
                <th className="r" title="Games back of first">
                  GB
                </th>
                <th className="r">Streak</th>
                <th>Last 5</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <Fragment key={r.teamId}>
                  {i === cutAfter && (
                    <tr>
                      <td colSpan={11} className="!border-0 !p-0">
                        <div className="flex items-center gap-3 px-3.5 py-1">
                          <div className="red-rule flex-1" />
                          <span className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-flame">
                            {cutLabel}
                          </span>
                          <div className="red-rule flex-1" />
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className={r.teamId === myTeamId ? "you" : "hov"}>
                    <td className="rk">{r.s.rank ?? i + 1}</td>
                    <td className="tm">
                      {r.teamName}
                      {r.teamId === myTeamId && <span className="youchip">YOU</span>}
                    </td>
                    <td className="dim">{r.manager ?? r.managerName ?? "—"}</td>
                    <td className="r num">{r.s.wins}</td>
                    <td className="r num">{r.s.losses}</td>
                    <td className="r num">{r.s.ties}</td>
                    <td className="r num">{anyScored ? fmt1(r.s.pointsFor) : "—"}</td>
                    <td className="r num">{anyScored ? fmt1(r.s.pointsAgainst) : "—"}</td>
                    <td className="r num">{gamesBack(r.s)}</td>
                    <td className="r num">{streak(r.teamId)}</td>
                    <td>
                      {last5(r.teamId).length === 0 ? (
                        <span className="dim">—</span>
                      ) : (
                        <span className="inline-flex gap-1">
                          {last5(r.teamId).map((res, j) => (
                            <span
                              key={j}
                              className={`res ${res}`}
                              style={{ width: 18, height: 18, fontSize: 11 }}
                            >
                              {res}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {weeks.length > 0 && (
        <div className="panel mt-4">
          <div className="ptitle">
            <span className="t">Weekly scoring</span>
            <span className="m">red = league high · bold = win</span>
          </div>
          <div className="overflow-x-auto">
            <table className="tbl whitespace-nowrap">
              <thead>
                <tr>
                  <th>Team</th>
                  {weeks.map((w) => (
                    <th key={w} className="r">
                      W{w}
                    </th>
                  ))}
                  <th className="r">Avg</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const inner = byTeamWeek.get(r.teamId);
                  const scores = weeks
                    .map((w) => inner?.get(w)?.pts)
                    .filter((x): x is number => x !== undefined);
                  const avg = scores.length
                    ? scores.reduce((a, b) => a + b, 0) / scores.length
                    : null;
                  return (
                    <tr key={r.teamId} className={r.teamId === myTeamId ? "you" : "hov"}>
                      <td className="tm">{r.teamName}</td>
                      {weeks.map((w) => {
                        const c = inner?.get(w);
                        if (!c)
                          return (
                            <td key={w} className="r num dim">
                              —
                            </td>
                          );
                        // Only flag a genuine high — an all-zero week (nothing
                        // scored yet) would otherwise light up every cell.
                        const high = (weekHigh.get(w) ?? 0) > 0 && c.pts === weekHigh.get(w);
                        return (
                          <td
                            key={w}
                            className={`r num ${
                              high ? "text-flame" : c.result === "W" ? "font-bold" : "dim"
                            }`}
                            style={{ fontSize: 11.5 }}
                          >
                            {fmt1(c.pts)}
                          </td>
                        );
                      })}
                      <td className="r num">{avg !== null ? fmt1(avg) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
