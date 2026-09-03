import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { matchups, teams } from "@/lib/db/schema";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { getLineupView, type SlotView } from "@/lib/lineups/service";
import { fmt1, fmtKick } from "@/lib/format";

export default async function MatchupDetailPage({
  params,
}: {
  params: Promise<{ slug: string; matchupId: string }>;
}) {
  const { slug, matchupId } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const [m] = await db
    .select()
    .from(matchups)
    .where(and(eq(matchups.id, Number(matchupId)), eq(matchups.leagueId, ctx.league.id)))
    .limit(1);
  if (!m || !m.awayTeamId) notFound();

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, ctx.league.id));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  const myTeamId = ctx.myTeam?.id ?? null;
  const final = m.status === "final";

  const settings = await getSettings(ctx.league.id);
  const [homeView, awayView] = await Promise.all([
    getLineupView(ctx.league.id, m.homeTeamId, ctx.league.season, m.week, settings.rosterTemplate),
    getLineupView(ctx.league.id, m.awayTeamId, ctx.league.season, m.week, settings.rosterTemplate),
  ]);

  const starters = (v: { slots: SlotView[] }) =>
    v.slots.filter((s) => s.slot !== "BENCH" && s.slot !== "IR");
  const homeSlots = starters(homeView);
  const awaySlots = starters(awayView);
  const slotKey = (s: SlotView) => `${s.slot}:${s.slotIndex}`;
  const awayBySlot = new Map(awaySlots.map((s) => [slotKey(s), s]));

  const topPts = (slots: SlotView[]) =>
    Math.max(...slots.map((s) => s.points ?? -Infinity));
  const homeTop = topPts(homeSlots);
  const awayTop = topPts(awaySlots);

  const playerCell = (s: SlotView | undefined, mirror: boolean, top: number) => {
    if (!s) return <div />;
    const value = s.points !== null ? fmt1(s.points) : s.kickoffAt ? fmtKick(s.kickoffAt) : "—";
    const isTop = final && s.points !== null && s.points === top && s.points > 0;
    return (
      <div className={`flex min-w-0 items-center justify-between gap-2 sm:gap-3 ${mirror ? "flex-row-reverse" : ""}`}>
        <div className={`min-w-0 ${mirror ? "text-right" : ""}`}>
          {s.playerName ? (
            <>
              <div className="truncate text-[13.5px] font-bold">{s.playerName}</div>
              <div className="text-[11px] text-faint">
                {s.position} · {s.nflTeam ?? "—"}
                {s.locked && s.points === null && <span className="ml-2">LOCKED</span>}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-faint">empty</div>
          )}
        </div>
        <div
          className={`font-mono text-[13.5px] ${s.points !== null ? (isTop ? "font-bold text-flame" : "") : "text-faint"}`}
        >
          {s.playerName ? value : ""}
        </div>
      </div>
    );
  };

  const teamHead = (id: number, pts: number | null, mirror: boolean) => {
    const winner = final && m.winnerTeamId === id;
    return (
      <div className={`min-w-0 ${mirror ? "text-right" : ""}`}>
        <div className="display text-lg sm:text-2xl">
          {winner && !mirror && <span className="res W mr-2.5">W</span>}
          {teamName.get(id) ?? "?"}
          {id === myTeamId && <span className="youchip">YOU</span>}
          {winner && mirror && <span className="res W ml-2.5">W</span>}
        </div>
        <div className="mt-2 font-mono text-3xl font-bold sm:text-[46px]">{fmt1(pts)}</div>
      </div>
    );
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <Link href={`/leagues/${slug}/matchups?week=${m.week}`} className="eyebrow">
            ← Week {m.week} matchups
          </Link>
          <h1 className="display">
            Week {m.week} {final ? "— Final" : "matchup"}
          </h1>
        </div>
      </header>

      <div className="panel">
        <div
          className="grid items-start gap-2 border-b border-line px-3 py-6 sm:gap-4 sm:px-[26px]"
          style={{ gridTemplateColumns: "1fr auto 1fr" }}
        >
          {teamHead(m.homeTeamId, m.homePoints, false)}
          <div className="display self-center text-[16px] text-faint">VS</div>
          {teamHead(m.awayTeamId, m.awayPoints, true)}
        </div>

        <div>
          {homeSlots.map((hs) => {
            const as = awayBySlot.get(slotKey(hs));
            const label =
              hs.slot === "BENCH" ? "BN" : `${hs.slot}${hs.slotIndex > 0 ? ` ${hs.slotIndex + 1}` : ""}`;
            return (
              <div
                key={hs.slotId}
                className="grid grid-cols-[1fr_44px_1fr] items-center gap-2 border-b border-line px-3 py-2.5 sm:grid-cols-[1fr_64px_1fr] sm:gap-4 sm:px-[26px]"
              >
                {playerCell(hs, false, homeTop)}
                <div className="display text-center text-xs text-faint">{label}</div>
                {playerCell(as, true, awayTop)}
              </div>
            );
          })}
        </div>

        <div
          className="grid grid-cols-[1fr_44px_1fr] items-center gap-2 bg-ink px-3 py-3.5 sm:grid-cols-[1fr_64px_1fr] sm:gap-4 sm:px-[26px]"
        >
          <div className="font-mono text-lg font-bold">{fmt1(m.homePoints)}</div>
          <div className="label text-center">Total</div>
          <div className="text-right font-mono text-lg font-bold">{fmt1(m.awayPoints)}</div>
        </div>
      </div>

      <p className="note mb-11 mt-3">
        {final
          ? "Final — scored from post-game charting."
          : "Slots lock at each player's kickoff. Points post after the weekly charting run — Tuesday 6:00 AM ET."}
      </p>
    </div>
  );
}
