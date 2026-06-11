import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { getLineupView, eligiblePositions } from "@/lib/lineups/service";
import { leagueCurrentWeek } from "@/lib/nfl/week";
import { LineupEditor } from "@/components/lineup-editor";
import { WeekNav } from "@/components/week-nav";

export default async function LineupPage({
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
  if (!ctx.myTeam) {
    return <p className="text-muted">You don&apos;t have a team in this league.</p>;
  }

  const week = weekParam
    ? Number(weekParam)
    : await leagueCurrentWeek(ctx.league.id, ctx.league.season);
  if (!Number.isInteger(week) || week < 1 || week > 18) notFound();

  const settings = await getSettings(ctx.league.id);
  const { slots, roster } = await getLineupView(
    ctx.league.id,
    ctx.myTeam.id,
    ctx.league.season,
    week,
    settings.rosterTemplate,
  );

  const eligibility: Record<string, string[]> = {};
  for (const def of settings.rosterTemplate.slots) {
    eligibility[def.slot] = eligiblePositions(settings.rosterTemplate, def.slot);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-xl">
          {ctx.myTeam.name} — Week {week}
        </h2>
        <WeekNav base={`/leagues/${slug}/lineup`} week={week} />
      </div>
      <LineupEditor
        slots={slots}
        roster={roster}
        eligibility={eligibility}
        slug={slug}
        week={week}
      />
    </div>
  );
}
