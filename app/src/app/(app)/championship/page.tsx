import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leagues } from "@/lib/db/schema";
import { sprintLeaderboard, SPRINT_WEEKS } from "@/lib/championship/service";
import { lockFieldAction } from "@/lib/championship/actions";
import { ActionForm } from "@/components/action-form";

export const metadata = { title: "Championship — FP Fantasy League" };

export default async function ChampionshipPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { season: seasonParam } = await searchParams;

  const [latest] = await db
    .select({ season: sql<number>`max(${leagues.season})` })
    .from(leagues);
  const season = seasonParam ? Number(seasonParam) : (latest?.season ?? new Date().getFullYear());

  const rows = await sprintLeaderboard(season);
  const admin = session.user.isSiteAdmin;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="display text-3xl">Championship sprint — {season}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          The top {2} teams from every league enter one global pool. Weeks{" "}
          {SPRINT_WEEKS[0]}–{SPRINT_WEEKS[SPRINT_WEEKS.length - 1]} cumulative starter points
          decide the champion. Keep setting your lineup in your home league!
        </p>
      </div>

      {admin && (
        <div className="max-w-md rounded-lg border border-line p-4">
          <h3 className="font-semibold">Admin: lock the field</h3>
          <p className="mt-1 text-sm text-muted">
            Run after week-14 results are final. Takes the top 2 ranked teams from every
            league&apos;s standings (re-running replaces the field).
          </p>
          <div className="mt-3">
            <ActionForm action={lockFieldAction} submitLabel="Lock field" successMessage="Field locked">
              <input type="hidden" name="season" value={season} />
            </ActionForm>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-muted">The field hasn&apos;t been set for {season} yet.</p>
      ) : (
        <table className="w-full max-w-4xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs text-faint">
              <th className="px-2 py-2 w-10">#</th>
              <th className="px-2 py-2">Team</th>
              <th className="px-2 py-2">League</th>
              <th className="px-2 py-2 text-right">Seed</th>
              {SPRINT_WEEKS.map((w) => (
                <th key={w} className="px-2 py-2 text-right">
                  W{w}
                </th>
              ))}
              <th className="px-2 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.teamId}
                className={`border-b border-line ${i === 0 ? "bg-flame/10" : ""}`}
              >
                <td className="px-2 py-1.5 text-faint">{i + 1}</td>
                <td className="px-2 py-1.5 font-medium">
                  {i === 0 && "👑 "}
                  {r.teamName}
                </td>
                <td className="px-2 py-1.5 text-muted">
                  <Link href={`/leagues/${r.leagueSlug}`} className="hover:underline">
                    {r.leagueName}
                  </Link>
                </td>
                <td className="px-2 py-1.5 text-right text-faint">{r.seed}</td>
                {SPRINT_WEEKS.map((w) => (
                  <td key={w} className="px-2 py-1.5 text-right font-mono">
                    {r.weekly[w] !== undefined ? r.weekly[w].toFixed(1) : "—"}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-mono font-semibold">
                  {r.total.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
