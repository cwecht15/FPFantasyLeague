import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchups, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { leagueCurrentWeek } from "@/lib/nfl/week";
import { WeekNav } from "@/components/week-nav";

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

  const week = weekParam
    ? Number(weekParam)
    : await leagueCurrentWeek(ctx.league.id, ctx.league.season);
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-xl">Week {week} matchups</h2>
        <WeekNav base={`/leagues/${slug}/matchups`} week={week} />
      </div>

      {rows.length === 0 ? (
        <p className="text-muted">
          No matchups scheduled{week === 1 ? " — ask the admin to generate the schedule" : ""}.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((m) => {
            const decided = m.status === "final";
            return (
              <li key={m.id} className="rounded-lg border border-line p-4">
                <div className="flex items-center justify-between">
                  <span className={decided && m.winnerTeamId === m.homeTeamId ? "font-semibold" : ""}>
                    {teamName.get(m.homeTeamId) ?? "?"}
                  </span>
                  <span className="font-mono">
                    {m.homePoints !== null ? m.homePoints.toFixed(2) : "—"}
                  </span>
                </div>
                {m.awayTeamId ? (
                  <div className="mt-1 flex items-center justify-between">
                    <span className={decided && m.winnerTeamId === m.awayTeamId ? "font-semibold" : ""}>
                      {teamName.get(m.awayTeamId) ?? "?"}
                    </span>
                    <span className="font-mono">
                      {m.awayPoints !== null ? m.awayPoints.toFixed(2) : "—"}
                    </span>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-faint">Bye week</div>
                )}
                <div className="mt-2 text-xs text-faint">
                  {m.status === "final" ? (m.isTie ? "Final — tie" : "Final") : m.status.replace("_", " ")}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
