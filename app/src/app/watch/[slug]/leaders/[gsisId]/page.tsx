/**
 * Spectator player detail: where a player's season points came from under this
 * league's scoring — component totals + week-by-week points, re-scored from
 * player_week_stats through the real engine.
 */

import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { getPublicLeague, getSettings } from "@/lib/leagues/service";
import {
  availableSeasons,
  breakdownLabel,
  playerSeasonBreakdown,
} from "@/lib/scoring/season-leaders";
import { fmt1 } from "@/lib/format";

export const metadata = { title: "Player breakdown" };

export default async function WatchPlayerBreakdownPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; gsisId: string }>;
  searchParams: Promise<{ season?: string }>;
}) {
  const { slug, gsisId } = await params;
  const { season: seasonParam } = await searchParams;
  const pub = await getPublicLeague(slug);
  if (!pub) notFound();
  const league = pub.league;

  const [player] = await db
    .select({
      gsisId: players.gsisId,
      name: players.displayName,
      position: players.position,
      nflTeam: players.nflTeam,
    })
    .from(players)
    .where(eq(players.gsisId, gsisId))
    .limit(1);
  if (!player) notFound();

  const seasons = [...new Set([league.season, ...(await availableSeasons())])].sort(
    (a, b) => b - a,
  );
  const season = seasonParam ? Number(seasonParam) : league.season;
  if (!seasons.includes(season)) notFound();

  const rules = (await getSettings(league.id)).scoringRules;
  const bd = await playerSeasonBreakdown(gsisId, season, rules, player.position);

  const components = bd
    ? Object.entries(bd.components).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    : [];
  const seasonQ = season !== league.season ? `?season=${season}` : "";

  return (
    <div>
      <header className="page-head">
        <div>
          <Link href={`/watch/${slug}/leaders${seasonQ}`} className="eyebrow">
            ← {season} leaders
          </Link>
          <h1 className="display">
            {player.name}
            <span className={`pos ${player.position} ml-3 align-middle`}>{player.position}</span>
          </h1>
          <div className="sub">
            {player.nflTeam ?? "—"} · scored under {league.name}&apos;s rules
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {seasons.map((s) => (
            <Link
              key={s}
              href={`/watch/${slug}/leaders/${gsisId}${s !== league.season ? `?season=${s}` : ""}`}
              className={`btn2 ${s === season ? "text-flame" : ""}`}
            >
              {s}
            </Link>
          ))}
        </div>
      </header>

      {!bd ? (
        <p className="empty">No stat lines for {player.name} in {season}.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="panel">
            <div className="ptitle">
              <span className="t">
                {season} · {fmt1(bd.points)} pts in {bd.games} games ({fmt1(bd.points / bd.games)}/g)
              </span>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Scoring component</th>
                  <th className="r">Points</th>
                </tr>
              </thead>
              <tbody>
                {components.map(([k, v]) => (
                  <tr key={k} className="hov">
                    <td>{breakdownLabel(k)}</td>
                    <td className={`r num font-bold ${v < 0 ? "text-flame" : ""}`}>{fmt1(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="ptitle">
              <span className="t">Week by week</span>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Week</th>
                  <th className="r">Points</th>
                </tr>
              </thead>
              <tbody>
                {bd.weeks.map((w) => (
                  <tr key={w.week} className="hov">
                    <td className="dim">W{w.week}</td>
                    <td className="r num">{fmt1(w.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
