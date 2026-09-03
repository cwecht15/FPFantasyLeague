/**
 * Spectator player leaderboard with a season selector. Every season is
 * re-scored from player_week_stats through the real engine under this
 * league's rules (seasonPointsByPlayer — shared 10-min cache with the draft
 * room), so past years show what players WOULD have scored here. Click a
 * player for their scoring breakdown.
 */

import Link from "next/link";
import { inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { getPublicLeague, getSettings } from "@/lib/leagues/service";
import { seasonPointsByPlayer } from "@/lib/draft/service";
import { availableSeasons } from "@/lib/scoring/season-leaders";
import { fmt1 } from "@/lib/format";

export const metadata = { title: "Leaders" };

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "COACH"];
const LIMIT = 75;

export default async function WatchLeadersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ pos?: string; season?: string }>;
}) {
  const { slug } = await params;
  const { pos: posParam = "ALL", season: seasonParam } = await searchParams;
  const pos = POSITIONS.includes(posParam) ? posParam : "ALL";
  const pub = await getPublicLeague(slug);
  if (!pub) notFound();
  const league = pub.league;

  const seasons = [...new Set([league.season, ...(await availableSeasons())])].sort(
    (a, b) => b - a,
  );
  const season = seasonParam ? Number(seasonParam) : league.season;
  if (!seasons.includes(season)) notFound();

  const rules = (await getSettings(league.id)).scoringRules;
  const totals = await seasonPointsByPlayer(season, rules);

  const ranked = [...totals.entries()]
    .map(([gsisId, line]) => ({ gsisId, ...line }))
    .sort((a, b) => b.points - a.points);

  const meta = new Map<
    string,
    { name: string; position: string; nflTeam: string | null }
  >();
  if (ranked.length > 0) {
    // Names/positions for everyone scored this season (position filter needs
    // positions before the limit is applied).
    const rows = await db
      .select({
        gsisId: players.gsisId,
        name: players.displayName,
        position: players.position,
        nflTeam: players.nflTeam,
      })
      .from(players)
      .where(inArray(players.gsisId, ranked.map((r) => r.gsisId)));
    for (const r of rows) {
      meta.set(r.gsisId, { name: r.name, position: r.position, nflTeam: r.nflTeam });
    }
  }

  const rows = ranked
    .map((r) => ({ ...r, ...(meta.get(r.gsisId) ?? { name: r.gsisId, position: "?", nflTeam: null }) }))
    .filter((r) => ["QB", "RB", "WR", "TE", "COACH"].includes(r.position))
    .filter((r) => pos === "ALL" || r.position === pos)
    .slice(0, LIMIT);

  const qs = (p: string, s: number) => {
    const parts = [];
    if (s !== league.season) parts.push(`season=${s}`);
    if (p !== "ALL") parts.push(`pos=${p}`);
    return parts.length ? `?${parts.join("&")}` : "";
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">
            {league.name} · {season}
          </div>
          <h1 className="display">Player leaders</h1>
          <div className="sub">
            {season === league.season
              ? "Season totals under this league's scoring — results post after the weekly charting run, Tuesday 6:00 AM ET."
              : `What ${season} would have scored under this league's rules. Click a player for the breakdown.`}
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {seasons.map((s) => (
              <Link
                key={s}
                href={`/watch/${slug}/leaders${qs(pos, s)}`}
                className={`btn2 ${s === season ? "text-flame" : ""}`}
              >
                {s}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {POSITIONS.map((p) => (
              <Link
                key={p}
                href={`/watch/${slug}/leaders${qs(p, season)}`}
                className={`btn2 ${p === pos ? "text-flame" : ""}`}
              >
                {p}
              </Link>
            ))}
          </div>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="empty">
          Nothing scored for {season} yet
          {seasons.length > 1 ? " — pick a past season above." : " — the leaderboard fills in after Week 1."}
        </p>
      ) : (
        <div className="panel">
          <div className="overflow-x-auto">
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
                  <td className="tm">
                    <Link
                      href={`/watch/${slug}/leaders/${r.gsisId}${season !== league.season ? `?season=${season}` : ""}`}
                      className="hover:text-flame"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td>
                    <span className={`pos ${r.position}`}>{r.position}</span>
                  </td>
                  <td className="dim">{r.nflTeam ?? "—"}</td>
                  <td className="r num">{r.games}</td>
                  <td className="r num font-bold">{fmt1(r.points)}</td>
                  <td className="r num">{fmt1(r.points / Math.max(1, r.games))}</td>
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
