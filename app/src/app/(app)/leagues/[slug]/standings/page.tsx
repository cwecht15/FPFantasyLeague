import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { standings, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";

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

  const rows = await db
    .select({ s: standings, teamName: teams.name })
    .from(standings)
    .innerJoin(teams, eq(standings.teamId, teams.id))
    .where(and(eq(standings.leagueId, ctx.league.id), eq(standings.season, ctx.league.season)))
    .orderBy(standings.rank);

  if (rows.length === 0) {
    return <p className="text-muted">No standings yet — they appear once a week is scored.</p>;
  }

  return (
    <div>
      <h2 className="display text-xl">Standings</h2>
      <table className="mt-4 w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-faint">
            <th className="px-2 py-2 w-10">#</th>
            <th className="px-2 py-2">Team</th>
            <th className="px-2 py-2 text-right">W</th>
            <th className="px-2 py-2 text-right">L</th>
            <th className="px-2 py-2 text-right">T</th>
            <th className="px-2 py-2 text-right">PF</th>
            <th className="px-2 py-2 text-right">PA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.s.teamId} className="border-b border-line">
              <td className="px-2 py-1.5 text-faint">{r.s.rank}</td>
              <td className="px-2 py-1.5">{r.teamName}</td>
              <td className="px-2 py-1.5 text-right">{r.s.wins}</td>
              <td className="px-2 py-1.5 text-right">{r.s.losses}</td>
              <td className="px-2 py-1.5 text-right">{r.s.ties}</td>
              <td className="px-2 py-1.5 text-right font-mono">{r.s.pointsFor.toFixed(1)}</td>
              <td className="px-2 py-1.5 text-right font-mono">{r.s.pointsAgainst.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
