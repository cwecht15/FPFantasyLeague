import Link from "next/link";
import { and, eq, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, playerWeekScores, rosterEntries } from "@/lib/db/schema";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { getLineupView } from "@/lib/lineups/service";
import { leagueCurrentWeek } from "@/lib/nfl/week";
import { fmt1 } from "@/lib/format";
import { DropButton } from "@/components/player-row-actions";
import { PlayerName } from "@/components/player-log";

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
    return <p className="empty">You don&apos;t have a team in this league.</p>;
  }

  const league = ctx.league;
  const week = await leagueCurrentWeek(league.id, league.season);
  const settings = await getSettings(league.id);

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
      .map((s) => [
        s.gsisId as string,
        s.slot === "BENCH" ? "BN" : `${s.slot}${s.slotIndex > 0 ? ` ${s.slotIndex + 1}` : ""}`,
      ]),
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
    .where(and(eq(rosterEntries.teamId, ctx.myTeam.id), isNull(rosterEntries.droppedAt)));

  const posOrder = new Map([["QB", 0], ["RB", 1], ["WR", 2], ["TE", 3]]);
  const sorted = [...rows].sort(
    (a, b) =>
      (posOrder.get(a.position) ?? 9) - (posOrder.get(b.position) ?? 9) ||
      Number(b.seasonPts) - Number(a.seasonPts),
  );

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">{ctx.myTeam.name}</div>
          <h1 className="display">Roster</h1>
          <div className="sub">
            {rows.length} players · Week {week} lineup shown ·{" "}
            <Link href={`/leagues/${slug}/players`} className="linkish">
              add from Players
            </Link>
          </div>
        </div>
      </header>

      <div className="panel">
        <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>NFL</th>
              <th>Slot (W{week})</th>
              <th className="r">Season pts</th>
              <th>Acquired</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const slot = slotByPlayer.get(r.gsisId) ?? "BN";
              const starter = slot !== "BN" && slot !== "IR";
              return (
                <tr key={r.gsisId} className="hov">
                  <td className="tm">
                    <PlayerName slug={slug} gsisId={r.gsisId} name={r.name} />
                  </td>
                  <td>
                    <span className={`pos ${r.position}`}>{r.position}</span>
                  </td>
                  <td className="dim">{r.nflTeam}</td>
                  <td>
                    {starter ? (
                      <span className="display text-[13px] text-flame">{slot}</span>
                    ) : (
                      <span className="dim">{slot}</span>
                    )}
                  </td>
                  <td className="r num">{fmt1(Number(r.seasonPts))}</td>
                  <td className="dim" style={{ fontSize: 12 }}>
                    {r.acquiredVia.replace("_", " ")} · {r.acquiredAt.toLocaleDateString()}
                  </td>
                  <td className="r">
                    <DropButton slug={slug} gsisId={r.gsisId} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {rows.length === 0 && (
          <p className="empty">No players yet — draft or add from the Players tab.</p>
        )}
      </div>
      <p className="note mb-11 mt-3">
        Dropping a starter empties that lineup slot. Locked players (kickoff passed) can&apos;t
        be dropped this week.
      </p>
    </div>
  );
}
