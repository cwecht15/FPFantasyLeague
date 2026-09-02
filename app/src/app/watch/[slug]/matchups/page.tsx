/**
 * Spectator matchups list — same rendering as the league page, with no
 * personalization ("Your matchup") and links into the /watch tree.
 */

import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { matchups, teams } from "@/lib/db/schema";
import { getPublicLeague, getSettings } from "@/lib/leagues/service";
import { playoffRoundLabel } from "@/lib/matchups/playoffs";
import { leagueCurrentWeek } from "@/lib/nfl/week";
import { fmt1 } from "@/lib/format";

export const metadata = { title: "Matchups" };

export default async function WatchMatchupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { slug } = await params;
  const { week: weekParam } = await searchParams;
  const pub = await getPublicLeague(slug);
  if (!pub) notFound();
  const league = pub.league;

  const currentWeek = await leagueCurrentWeek(league.id, league.season);
  const week = weekParam ? Number(weekParam) : currentWeek;
  if (!Number.isInteger(week) || week < 1 || week > 18) notFound();

  const rows = await db
    .select()
    .from(matchups)
    .where(
      and(
        eq(matchups.leagueId, league.id),
        eq(matchups.season, league.season),
        eq(matchups.week, week),
      ),
    )
    .orderBy(matchups.id);

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, league.id));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  const base = `/watch/${slug}/matchups`;
  const playoffField = rows.some((m) => m.isPlayoff)
    ? (await getSettings(league.id)).playoffConfig.teams
    : 0;

  const teamRow = (m: (typeof rows)[number], side: "home" | "away") => {
    const id = side === "home" ? m.homeTeamId : m.awayTeamId!;
    const pts = side === "home" ? m.homePoints : m.awayPoints;
    const winner = m.status === "final" && m.winnerTeamId === id;
    return (
      <div className="flex items-center justify-between px-[22px] py-2.5">
        <span
          className={`display text-[19px] ${winner ? "" : m.status === "final" ? "text-muted" : ""}`}
        >
          {winner && <span className="res W mr-2.5">W</span>}
          {teamName.get(id) ?? "?"}
        </span>
        <span className="font-mono text-2xl font-bold">{fmt1(pts)}</span>
      </div>
    );
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">{league.name}</div>
          <h1 className="display">Week {week} matchups</h1>
        </div>
        <div className="flex items-center gap-2.5">
          {week > 1 ? (
            <Link href={`${base}?week=${week - 1}`} className="btn2">
              ‹
            </Link>
          ) : (
            <button className="btn2" disabled>
              ‹
            </button>
          )}
          <span className="display min-w-[92px] text-center text-[18px]">Week {week}</span>
          {week < currentWeek ? (
            <Link href={`${base}?week=${week + 1}`} className="btn2">
              ›
            </Link>
          ) : (
            <button className="btn2" disabled>
              ›
            </button>
          )}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="empty">No matchups scheduled.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((m) => (
            <Link key={m.id} href={`${base}/${m.id}`} className="panel block hover:border-line-strong">
              <div className="py-2.5">
                {teamRow(m, "home")}
                {m.awayTeamId ? (
                  teamRow(m, "away")
                ) : (
                  <div className="px-[22px] py-2.5 text-sm text-faint">Bye week</div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-line px-[22px] py-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-faint">
                <span>
                  {m.isPlayoff && (
                    <span className="mr-3 text-flame">
                      {playoffRoundLabel(m.playoffRound ?? 1, playoffField)}
                    </span>
                  )}
                  {m.status === "final" ? (m.isTie ? "Final — Tie" : "Final") : "Scheduled"}
                </span>
                <span>Head-to-head →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
