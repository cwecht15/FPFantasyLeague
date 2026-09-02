/**
 * Spectator player leaderboard: season totals under this league's scoring,
 * summed from player_week_scores (so it's exactly what the matchups paid).
 * Fills in as weeks get scored; position chips filter via GET links.
 */

import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { players, playerWeekScores } from "@/lib/db/schema";
import { getPublicLeague } from "@/lib/leagues/service";
import { fmt1 } from "@/lib/format";

export const metadata = { title: "Leaders" };

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "COACH"];
const LIMIT = 75;

export default async function WatchLeadersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pos?: string }>;
}) {
  const { slug } = await params;
  const { pos: posParam = "ALL" } = await searchParams;
  const pos = POSITIONS.includes(posParam) ? posParam : "ALL";
  const pub = await getPublicLeague(slug);
  if (!pub) notFound();
  const league = pub.league;

  const totalPts = sql<number>`sum(${playerWeekScores.fantasyPoints})`;
  const rows = await db
    .select({
      gsisId: playerWeekScores.gsisId,
      name: players.displayName,
      position: players.position,
      nflTeam: players.nflTeam,
      points: totalPts,
      games: sql<number>`count(*)`,
    })
    .from(playerWeekScores)
    .innerJoin(players, eq(players.gsisId, playerWeekScores.gsisId))
    .where(
      and(
        eq(playerWeekScores.leagueId, league.id),
        eq(playerWeekScores.season, league.season),
        eq(playerWeekScores.seasonType, "REG"),
        ...(pos === "ALL" ? [] : [eq(players.position, pos)]),
      ),
    )
    .groupBy(playerWeekScores.gsisId, players.displayName, players.position, players.nflTeam)
    .orderBy(desc(totalPts))
    .limit(LIMIT);

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">
            {league.name} · {league.season}
          </div>
          <h1 className="display">Player leaders</h1>
          <div className="sub">
            Season totals under this league&apos;s scoring — results post after the weekly
            charting run, Tuesday 6:00 AM ET.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {POSITIONS.map((p) => (
            <Link
              key={p}
              href={p === "ALL" ? `/watch/${slug}/leaders` : `/watch/${slug}/leaders?pos=${p}`}
              className={`btn2 ${p === pos ? "text-flame" : ""}`}
            >
              {p}
            </Link>
          ))}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="empty">Nothing scored yet — the leaderboard fills in after Week 1.</p>
      ) : (
        <div className="panel">
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th>Player</th>
                <th>Pos</th>
                <th>NFL team</th>
                <th className="r">G</th>
                <th className="r">FPTS</th>
                <th className="r">FPTS/G</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.gsisId} className="hov">
                  <td className="rk">{i + 1}</td>
                  <td className="tm">{r.name}</td>
                  <td>
                    <span className={`pos ${r.position}`}>{r.position}</span>
                  </td>
                  <td className="dim">{r.nflTeam ?? "—"}</td>
                  <td className="r num">{r.games}</td>
                  <td className="r num font-bold">{fmt1(Number(r.points))}</td>
                  <td className="r num">{fmt1(Number(r.points) / Math.max(1, Number(r.games)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
