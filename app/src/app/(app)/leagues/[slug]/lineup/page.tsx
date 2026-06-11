import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { getLineupView, eligiblePositions } from "@/lib/lineups/service";
import { leagueCurrentWeek } from "@/lib/nfl/week";
import { LineupEditor } from "@/components/lineup-editor";

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
    return <p className="empty">You don&apos;t have a team in this league.</p>;
  }

  const currentWeek = await leagueCurrentWeek(ctx.league.id, ctx.league.season);
  const week = weekParam ? Number(weekParam) : currentWeek;
  if (!Number.isInteger(week) || week < 1 || week > currentWeek) notFound();
  const isCurrent = week === currentWeek;

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

  const base = `/leagues/${slug}/lineup`;

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">{ctx.myTeam.name}</div>
          <h1 className="display">Week {week} lineup</h1>
          <div className="sub">
            {isCurrent
              ? "Slots lock individually at each player's kickoff. Scored after charting — results post Tuesday 6:00 AM ET."
              : "Final — scored from post-game charting."}
          </div>
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

      <LineupEditor
        slots={slots}
        roster={roster}
        eligibility={eligibility}
        slug={slug}
        week={week}
        editable={isCurrent}
      />
    </div>
  );
}
