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

  // Bracket-mode leagues cut to their own playoffs; everyone else feeds the
  // cross-league championship sprint (top 2).
  const playoffCfg = playoffConfigSchema.safeParse(
    (await getSettings(league.id)).playoffConfig,
  );
  const bracket = playoffCfg.success && playoffCfg.data.mode === "bracket";
  const cutAfter = bracket ? playoffCfg.data.teams : 2;
  const cutLabel = bracket ? "Playoff line" : "Championship sprint line";
  const lastWeek = bracket
    ? playoffCfg.data.startWeek + Math.ceil(Math.log2(Math.max(2, playoffCfg.data.teams))) - 1
    : 17;
  const subCopy = bracket
    ? `Top ${playoffCfg.data.teams} by record make the playoffs (points-for breaks ties) — weeks ${playoffCfg.data.startWeek}–${lastWeek}.`
    : "Top 2 enter the championship sprint after Week 14.";

  const rows = await db
    .select({
      s: standings,
      teamName: teams.name,
      manager: users.displayName,
      managerName: users.name,
    })
    .from(standings)
    .innerJoin(teams, eq(standings.teamId, teams.id))
    .leftJoin(users, eq(teams.ownerUserId, users.id))
    .where(and(eq(standings.leagueId, league.id), eq(standings.season, league.season)))
    .orderBy(standings.rank);

  // Final matchups → last-5 strips + the weekly scoring matrix.
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

  type Cell = { pts: number; won: boolean };
  const byTeamWeek = new Map<number, Map<number, Cell>>();
  const weeksSet = new Set<number>();
  for (const m of finals) {
    if (!m.awayTeamId || m.homePoints === null || m.awayPoints === null) continue;
    weeksSet.add(m.week);
    const put = (teamId: number, pts: number, won: boolean) => {
      const inner = byTeamWeek.get(teamId) ?? new Map<number, Cell>();
      inner.set(m.week, { pts, won });
      byTeamWeek.set(teamId, inner);
    };
    put(m.homeTeamId, m.homePoints, m.winnerTeamId === m.homeTeamId);
    put(m.awayTeamId, m.awayPoints, m.winnerTeamId === m.awayTeamId);
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

  const last5 = (teamId: number) => {
    const inner = byTeamWeek.get(teamId);
    if (!inner) return [];
    return [...inner.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, 5)
      .reverse()
      .map(([, c]) => c.won);
  };

  if (rows.length === 0) {
    return (
      <div>
        <header className="page-head">
          <div>
            <div className="eyebrow">{league.name}</div>
            <h1 className="display">Standings</h1>
          </div>
        </header>
        <p className="empty">No standings yet — they appear once a week is scored.</p>
      </div>
    );
  }

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">
            {league.name} · {league.season}
          </div>
          <h1 className="display">Standings</h1>
          <div className="sub">{subCopy}</div>
        </div>
      </header>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th></th>
              <th>Team</th>
              <th>Manager</th>
              <th className="r">W</th>
              <th className="r">L</th>
              <th className="r">T</th>
              <th className="r">PF</th>
              <th className="r">PA</th>
              <th>Last 5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <>
                {i === cutAfter && (
                  <tr key="cutline">
                    <td colSpan={9} className="!border-0 !p-0">
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
                <tr key={r.s.teamId} className={r.s.teamId === myTeamId ? "you" : "hov"}>
                  <td className="rk">{r.s.rank}</td>
                  <td className="tm">
                    {r.teamName}
                    {r.s.teamId === myTeamId && <span className="youchip">YOU</span>}
                  </td>
                  <td className="dim">{r.manager ?? r.managerName ?? "—"}</td>
                  <td className="r num">{r.s.wins}</td>
                  <td className="r num">{r.s.losses}</td>
                  <td className="r num">{r.s.ties}</td>
                  <td className="r num">{fmt1(r.s.pointsFor)}</td>
                  <td className="r num">{fmt1(r.s.pointsAgainst)}</td>
                  <td>
                    <span className="inline-flex gap-1">
                      {last5(r.s.teamId).map((won, j) => (
                        <span
                          key={j}
                          className={`res ${won ? "W" : "L"}`}
                          style={{ width: 18, height: 18, fontSize: 11 }}
                        >
                          {won ? "W" : "L"}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>

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
                  const inner = byTeamWeek.get(r.s.teamId);
                  const scores = weeks
                    .map((w) => inner?.get(w)?.pts)
                    .filter((x): x is number => x !== undefined);
                  const avg = scores.length
                    ? scores.reduce((a, b) => a + b, 0) / scores.length
                    : null;
                  return (
                    <tr key={r.s.teamId} className={r.s.teamId === myTeamId ? "you" : "hov"}>
                      <td className="tm">{r.teamName}</td>
                      {weeks.map((w) => {
                        const c = inner?.get(w);
                        if (!c)
                          return (
                            <td key={w} className="r num dim">
                              —
                            </td>
                          );
                        const high = c.pts === weekHigh.get(w);
                        return (
                          <td
                            key={w}
                            className={`r num ${high ? "text-flame" : c.won ? "font-bold" : "dim"}`}
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
