/**
 * Spectator draft view: status bar + pick ticker + the full board. Read-only —
 * no pick buttons, no queues, no start/pause, no available-players list.
 * Polls via <PollRefresher> (RSC refresh) while the draft is live.
 */

import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { players, teams } from "@/lib/db/schema";
import { getPublicLeague } from "@/lib/leagues/service";
import { getDraft, getDraftBoard } from "@/lib/draft/service";
import { PollRefresher } from "@/components/draft-client";
import { DraftBoard, type BoardPlayer } from "@/components/draft-board";

export const metadata = { title: "Draft board" };

export default async function WatchDraftPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pub = await getPublicLeague(slug);
  if (!pub) notFound();

  const draft = await getDraft(pub.league.id);
  if (!draft) {
    return (
      <header className="page-head">
        <div>
          <h1 className="display">Draft</h1>
          <div className="sub">The draft hasn&apos;t started yet — check back soon.</div>
        </div>
      </header>
    );
  }

  const board = await getDraftBoard(draft.id);
  const teamRows = await db
    .select({ id: teams.id, name: teams.name, draftPosition: teams.draftPosition })
    .from(teams)
    .where(eq(teams.leagueId, pub.league.id));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));
  const orderedTeams = [...teamRows].sort(
    (a, b) => (a.draftPosition ?? 99) - (b.draftPosition ?? 99),
  );

  // Spectators only need the players who have actually been picked — not the
  // whole-table load the authed draft room does.
  const pickedIds = board.map((p) => p.gsisId).filter((x): x is string => !!x);
  const boardPlayers = new Map<string, BoardPlayer>();
  if (pickedIds.length > 0) {
    const rows = await db
      .select({
        gsisId: players.gsisId,
        name: players.displayName,
        position: players.position,
        nflTeam: players.nflTeam,
      })
      .from(players)
      .where(inArray(players.gsisId, pickedIds));
    for (const r of rows) {
      boardPlayers.set(r.gsisId, { name: r.name, position: r.position, nflTeam: r.nflTeam });
    }
  }

  const current = board.find((p) => p.id === draft.currentPickId) ?? null;
  const currentTeam = current ? teamById.get(current.teamId) : null;

  const madePicks = board
    .filter((p) => p.pickedAt)
    .sort((a, b) => b.overallPick - a.overallPick);
  const upcoming =
    draft.status === "complete"
      ? []
      : board
          .filter((p) => !p.pickedAt)
          .sort((a, b) => a.overallPick - b.overallPick)
          .slice(0, 4)
          .reverse();

  return (
    <div>
      {(draft.status === "in_progress" || draft.status === "paused") && <PollRefresher />}

      {/* status bar */}
      <div className="panel flex flex-wrap items-center justify-between gap-4 px-[22px] py-4">
        <div className="flex items-center gap-4">
          {draft.status === "complete" ? (
            <span className="display text-[22px]">Draft complete</span>
          ) : current ? (
            <>
              <div>
                <div className="text-xs text-faint">
                  Round {current.round}, pick {current.overallPick}
                </div>
                <div className="display text-[22px]">{currentTeam?.name}</div>
              </div>
              {draft.status === "paused" && (
                <span className="display border border-line bg-surface px-2.5 py-1 text-[12px]">
                  Paused
                </span>
              )}
            </>
          ) : null}
        </div>
        <span className="text-xs text-faint">
          {draft.status === "complete" ? "" : "Updates automatically as picks come in"}
        </span>
      </div>

      {/* pick ticker */}
      {(madePicks.length > 0 || upcoming.length > 0) && (
        <div className="panel mt-2 overflow-x-auto">
          <div className="flex items-stretch" style={{ minWidth: "max-content" }}>
            {upcoming.map((p) => {
              const onClock = p.id === draft.currentPickId;
              return (
                <div
                  key={p.id}
                  className="shrink-0 border-r border-line px-4 py-2.5"
                  style={onClock ? undefined : { opacity: 0.55 }}
                >
                  <div className="num font-mono text-[10.5px] text-faint">
                    R{p.round} · P{p.overallPick} · {teamById.get(p.teamId)?.name}
                  </div>
                  <div
                    className={`mt-0.5 text-[13.5px] ${onClock ? "display text-flame" : "text-faint"}`}
                    style={onClock ? undefined : { fontWeight: 800 }}
                  >
                    {onClock
                      ? draft.status === "paused"
                        ? "Paused"
                        : "On the clock"
                      : "Up next"}
                  </div>
                </div>
              );
            })}
            {madePicks.map((p) => {
              const pl = boardPlayers.get(p.gsisId ?? "");
              return (
                <div key={p.id} className="shrink-0 border-r border-line px-4 py-2.5 last:border-r-0">
                  <div className="num font-mono text-[10.5px] text-faint">
                    R{p.round} · P{p.overallPick} · {teamById.get(p.teamId)?.name}
                    {p.isAutopick && " (auto)"}
                  </div>
                  <div
                    className="mt-0.5 flex items-center gap-1.5 text-[13.5px]"
                    style={{ fontWeight: 800 }}
                  >
                    {pl && <span className={`pos ${pl.position}`}>{pl.position}</span>}
                    <span>{pl?.name ?? p.gsisId}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        <DraftBoard
          teams={orderedTeams}
          picks={board}
          players={boardPlayers}
          currentPickId={draft.status === "complete" ? null : draft.currentPickId}
          myTeamId={null}
        />
      </div>
    </div>
  );
}
