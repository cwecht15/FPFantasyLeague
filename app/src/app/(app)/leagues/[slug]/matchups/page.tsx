import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchups, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { leagueCurrentWeek } from "@/lib/nfl/week";
import { fmt1 } from "@/lib/format";

export default async function MatchupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { slug } = await params;
  const { week: weekParam } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const currentWeek = await leagueCurrentWeek(ctx.league.id, ctx.league.season);
  const week = weekParam ? Number(weekParam) : currentWeek;
  if (!Number.isInteger(week) || week < 1 || week > 18) notFound();

  const rows = await db
    .select()
    .from(matchups)
    .where(
      and(
        eq(matchups.leagueId, ctx.league.id),
        eq(matchups.season, ctx.league.season),
        eq(matchups.week, week),
      ),
    )
    .orderBy(matchups.id);

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, ctx.league.id));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  const myTeamId = ctx.myTeam?.id ?? null;
  const base = `/leagues/${slug}/matchups`;

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
          <div className="eyebrow">{ctx.league.name}</div>
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
          {rows.map((m) => {
            const mine = myTeamId !== null && (m.homeTeamId === myTeamId || m.awayTeamId === myTeamId);
            return (
              <Link
                key={m.id}
                href={`${base}/${m.id}`}
                className="panel block hover:border-line-strong"
                style={mine ? { borderColor: "rgba(204,51,51,0.5)" } : undefined}
              >
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
                    {m.status === "final" ? (m.isTie ? "Final — Tie" : "Final") : "Scheduled"}
                    {mine && <span className="ml-3 text-flame">Your matchup</span>}
                  </span>
                  <span>Head-to-head →</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
