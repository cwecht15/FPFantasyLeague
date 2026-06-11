import { and, eq, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, playerWeekScores, rosterEntries } from "@/lib/db/schema";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { getLineupView } from "@/lib/lineups/service";
import { leagueCurrentWeek } from "@/lib/nfl/week";
import { DropButton } from "@/components/player-row-actions";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();
  if (!ctx.myTeam) {
    return <p className="text-muted">You don&apos;t have a team in this league.</p>;
  }

  const league = ctx.league;
  const week = await leagueCurrentWeek(league.id, league.season);
  const settings = await getSettings(league.id);

  // Current-week slot per player (also triggers the never-empty autofill).
  const view = await getLineupView(
    league.id,
    ctx.myTeam.id,
    league.season,
    week,
    settings.rosterTemplate,
  );
  const slotByPlayer = new Map(
    view.slots
      .filter((s) => s.gsisId)
      .map((s) => [s.gsisId as string, `${s.slot}${s.slotIndex > 0 ? ` ${s.slotIndex + 1}` : ""}`]),
  );

  const rows = await db
    .select({
      gsisId: rosterEntries.gsisId,
      acquiredVia: rosterEntries.acquiredVia,
      acquiredAt: rosterEntries.acquiredAt,
      name: players.displayName,
      position: players.position,
      nflTeam: players.nflTeam,
      seasonPts: sql<number>`coalesce((
        SELECT sum(${playerWeekScores.fantasyPoints})
          FROM ${playerWeekScores}
         WHERE ${playerWeekScores.gsisId} = ${rosterEntries.gsisId}
           AND ${playerWeekScores.leagueId} = ${league.id}
           AND ${playerWeekScores.season} = ${league.season}
           AND ${playerWeekScores.seasonType} = 'REG'
      ), 0)`,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(players.gsisId, rosterEntries.gsisId))
    .where(and(eq(rosterEntries.teamId, ctx.myTeam.id), isNull(rosterEntries.droppedAt)))
    .orderBy(rosterEntries.id);

  const posOrder = new Map([["QB", 0], ["RB", 1], ["WR", 2], ["TE", 3]]);
  const sorted = [...rows].sort(
    (a, b) =>
      (posOrder.get(a.position) ?? 9) - (posOrder.get(b.position) ?? 9) ||
      Number(b.seasonPts) - Number(a.seasonPts),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-xl">{ctx.myTeam.name}</h2>
        <span className="text-sm text-muted">
          {rows.length} players · week {week} lineup shown
        </span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-faint">
            <th className="px-2 py-2">Player</th>
            <th className="px-2 py-2">Pos</th>
            <th className="px-2 py-2">NFL</th>
            <th className="px-2 py-2">Slot (W{week})</th>
            <th className="px-2 py-2 text-right">Season pts</th>
            <th className="px-2 py-2">Acquired</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const slot = slotByPlayer.get(r.gsisId);
            const starter = slot && slot !== "IR" && !slot.startsWith("BENCH");
            return (
              <tr key={r.gsisId} className="border-b border-line hover:bg-pit">
                <td className="px-2 py-1.5 font-bold">{r.name}</td>
                <td className="px-2 py-1.5">{r.position}</td>
                <td className="px-2 py-1.5 text-muted">{r.nflTeam}</td>
                <td className="px-2 py-1.5">
                  {slot ? (
                    <span className={starter ? "font-bold text-flame" : "text-muted"}>{slot}</span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {Number(r.seasonPts).toFixed(1)}
                </td>
                <td className="px-2 py-1.5 text-xs text-faint">
                  {r.acquiredVia.replace("_", " ")} · {r.acquiredAt.toLocaleDateString()}
                </td>
                <td className="px-2 py-1.5">
                  <DropButton slug={slug} gsisId={r.gsisId} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-sm text-faint">No players yet — draft or add from the Players tab.</p>
      )}
    </div>
  );
}
