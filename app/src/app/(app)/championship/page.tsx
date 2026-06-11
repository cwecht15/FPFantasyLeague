import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leagues } from "@/lib/db/schema";
import { sprintLeaderboard, SPRINT_WEEKS } from "@/lib/championship/service";
import { isWeekDataLocked } from "@/lib/nfl/locks";
import { lockFieldAction } from "@/lib/championship/actions";
import { ActionForm } from "@/components/action-form";
import { fmt1 } from "@/lib/format";

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

  // Which sprint weeks have posted?
  const postedWeeks: number[] = [];
  for (const w of SPRINT_WEEKS) {
    const anyPoints = rows.some((r) => r.weekly[w] !== undefined);
    if (anyPoints || (rows.length > 0 && (await isWeekDataLocked(season, w)))) postedWeeks.push(w);
  }
  const throughWeek = postedWeeks.length ? Math.max(...postedWeeks) : null;
  const isFinal = rows.length > 0 && postedWeeks.length === SPRINT_WEEKS.length;

  // Rows sort by cumulative total once anything posts; otherwise by seed.
  const sorted = [...rows].sort((a, b) =>
    throughWeek ? b.total - a.total : a.seed - b.seed || a.teamName.localeCompare(b.teamName),
  );
  const seedOrder = [...rows].sort(
    (a, b) => a.seed - b.seed || a.teamName.localeCompare(b.teamName),
  );
  const seedRank = new Map(seedOrder.map((r, i) => [r.teamId, i + 1]));
  const champion = isFinal ? sorted[0] : null;

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">Cross-league sprint · weeks 15–17</div>
          <h1 className="display">Championship</h1>
          <div className="sub">
            Top 2 from every league. Cumulative starter points across Weeks{" "}
            {SPRINT_WEEKS[0]}–{SPRINT_WEEKS[SPRINT_WEEKS.length - 1]} decide the title.
          </div>
        </div>
        <div className="chip">
          <span>
            {isFinal
              ? `Final — ${season}`
              : throughWeek
                ? `Through week ${throughWeek}`
                : `${season}`}
          </span>
        </div>
      </header>

      {champion && (
        <div
          className="mb-4 flex items-center gap-6 border border-line bg-surface px-[26px] py-5"
          style={{ borderLeft: "3px solid var(--color-flame)" }}
        >
          <Image src="/brand/Submark-Red.svg" alt="" width={54} height={54} />
          <div>
            <div className="eyebrow">{season} champion</div>
            <div className="display text-[34px]">{champion.teamName}</div>
            <div className="mt-1 text-sm text-muted">
              {champion.leagueName} ·{" "}
              <b className="font-mono text-paper">{fmt1(champion.total)}</b> points across the
              sprint
            </div>
          </div>
        </div>
      )}

      {admin && rows.length === 0 && (
        <div className="panel mb-4 max-w-md">
          <div className="ptitle">
            <span className="t">Admin: lock the field</span>
          </div>
          <div className="px-[22px] py-4">
            <p className="note mb-3">
              Run after week-14 results are final — takes the top 2 ranked teams from every
              league&apos;s standings (re-running replaces the field).
            </p>
            <ActionForm
              action={lockFieldAction}
              submitLabel="Lock the field"
              successMessage="Field locked"
            >
              <input type="hidden" name="season" value={season} />
            </ActionForm>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="empty">The field hasn&apos;t been set for {season} yet.</p>
      ) : (
        <div className="panel">
          <table className="tbl">
            <thead>
              <tr>
                <th></th>
                <th style={{ width: 50 }}>Move</th>
                <th>Team</th>
                <th>League</th>
                <th className="r">Seed</th>
                {SPRINT_WEEKS.map((w) => (
                  <th key={w} className="r">
                    W{w}
                  </th>
                ))}
                <th className="r">Total</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const move = (seedRank.get(r.teamId) ?? i + 1) - (i + 1);
                return (
                  <tr key={r.teamId} className="hov">
                    <td className="rk">
                      {i + 1}
                      {champion && i === 0 && <span className="ml-1 text-flame">★</span>}
                    </td>
                    <td className="num" style={{ fontSize: 11.5 }}>
                      {!throughWeek || move === 0 ? (
                        <span className="dim">—</span>
                      ) : move > 0 ? (
                        <span className="text-flame">▲{move}</span>
                      ) : (
                        <span className="dim">▼{-move}</span>
                      )}
                    </td>
                    <td className="tm">{r.teamName}</td>
                    <td className="dim">
                      <Link href={`/leagues/${r.leagueSlug}`} className="hover:underline">
                        {r.leagueName}
                      </Link>
                    </td>
                    <td className="r num">{r.seed}</td>
                    {SPRINT_WEEKS.map((w) => (
                      <td key={w} className={`r num ${r.weekly[w] === undefined ? "dim" : ""}`}>
                        {r.weekly[w] !== undefined ? fmt1(r.weekly[w]) : "—"}
                      </td>
                    ))}
                    <td className={`r num font-bold ${throughWeek && i === 0 ? "text-flame" : ""}`}>
                      {fmt1(r.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="note mb-11 mt-3">
        Seeding = league finish at the week-14 lock. Weeks pend until charting posts (Tuesday
        6:00 AM ET) and lock Thursday noon. Tiebreak: higher total in the final week.
      </p>
    </div>
  );
}
