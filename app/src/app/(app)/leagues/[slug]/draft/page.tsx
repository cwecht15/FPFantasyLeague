import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { getDraft, getDraftBoard, listAvailable } from "@/lib/draft/service";
import { listMyQueue, pauseDraftAction, startDraftAction } from "@/lib/draft/actions";
import { ActionForm } from "@/components/action-form";
import { Countdown, PickButton, PollRefresher, QueueRemove } from "@/components/draft-client";
import { DraftBoard, type BoardPlayer } from "@/components/draft-board";
import { fmt1 } from "@/lib/format";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "COACH"];

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; pos?: string }>;
}) {
  const { slug } = await params;
  const { q = "", pos = "ALL" } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();
  const admin = session.user.isSiteAdmin;

  const draft = await getDraft(ctx.league.id);

  if (!draft) {
    return (
      <div>
        <header className="page-head">
          <div>
            <div className="eyebrow">{ctx.league.name}</div>
            <h1 className="display">Draft</h1>
            <div className="sub">The draft hasn&apos;t started yet.</div>
          </div>
        </header>
        {admin && (
          <div className="panel max-w-md">
            <div className="ptitle">
              <span className="t">Start the draft</span>
            </div>
            <div className="px-[22px] py-4">
              <p className="note mb-3">
                Uses the league&apos;s draft config (order, rounds, clock). All teams must be
                claimed.
              </p>
              <ActionForm action={startDraftAction} submitLabel="Start draft">
                <input type="hidden" name="slug" value={slug} />
              </ActionForm>
            </div>
          </div>
        )}
      </div>
    );
  }

  const board = await getDraftBoard(draft.id);
  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      ownerUserId: teams.ownerUserId,
      draftPosition: teams.draftPosition,
    })
    .from(teams)
    .where(eq(teams.leagueId, ctx.league.id));
  const teamById = new Map(teamRows.map((t) => [t.id, t]));

  const playerNames = new Map<string, string>();
  const boardPlayers = new Map<string, BoardPlayer>();
  {
    const rows = await db
      .select({
        gsisId: players.gsisId,
        name: players.displayName,
        position: players.position,
        nflTeam: players.nflTeam,
      })
      .from(players);
    for (const r of rows) {
      playerNames.set(r.gsisId, `${r.name} (${r.position})`);
      boardPlayers.set(r.gsisId, { name: r.name, position: r.position, nflTeam: r.nflTeam });
    }
  }

  const current = board.find((p) => p.id === draft.currentPickId) ?? null;
  const currentTeam = current ? teamById.get(current.teamId) : null;
  const myTurn =
    draft.status === "in_progress" && !!currentTeam && currentTeam.ownerUserId === session.user.id;
  const canPickNow = myTurn || (admin && draft.status === "in_progress");

  const available =
    draft.status === "in_progress" || draft.status === "paused"
      ? await listAvailable(ctx.league.id, ctx.league.season, { q, pos, limit: 60 })
      : [];

  const myQueue = ctx.myTeam ? await listMyQueue(ctx.league.id, ctx.myTeam.id) : [];
  const recent = board
    .filter((p) => p.pickedAt)
    .sort((a, b) => b.overallPick - a.overallPick)
    .slice(0, 10);

  const orderedTeams = [...teamRows].sort(
    (a, b) => (a.draftPosition ?? 99) - (b.draftPosition ?? 99),
  );

  return (
    <div>
      {(draft.status === "in_progress" || draft.status === "paused") && <PollRefresher />}

      <header className="page-head">
        <div>
          <div className="eyebrow">{ctx.league.name}</div>
          <h1 className="display">Draft</h1>
        </div>
        <Link href={`/leagues/${slug}/draft/board`} className="btn pri">
          <span>Draft board</span>
        </Link>
      </header>

      {/* status bar */}
      <div
        className="panel flex flex-wrap items-center justify-between gap-4 px-[22px] py-4"
        style={myTurn ? { borderLeft: "3px solid var(--color-flame)" } : undefined}
      >
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
              {myTurn && (
                <span className="chip" style={{ fontSize: 13 }}>
                  <span>Your pick</span>
                </span>
              )}
              {draft.status === "paused" && (
                <span className="display border border-line bg-surface px-2.5 py-1 text-[12px]">
                  Paused
                </span>
              )}
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-5">
          {draft.status === "in_progress" && current?.deadlineAt && (
            <Countdown deadline={current.deadlineAt.toISOString()} />
          )}
          {admin && draft.status !== "complete" && (
            <ActionForm
              action={pauseDraftAction}
              submitLabel={draft.status === "paused" ? "Resume" : "Pause"}
              className="flex items-center gap-2"
            >
              <input type="hidden" name="slug" value={slug} />
              <input
                type="hidden"
                name="paused"
                value={draft.status === "paused" ? "false" : "true"}
              />
            </ActionForm>
          )}
        </div>
      </div>

      {draft.status !== "complete" && (
        <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "1.8fr 1fr" }}>
          <div className="panel">
            <div className="ptitle">
              <span className="t">Available players</span>
              <span className="flex items-center gap-2">
                <form action={`/leagues/${slug}/draft`} method="get" className="flex items-center gap-2">
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="Search…"
                    className="input"
                    style={{ padding: "5px 10px", fontSize: 13, width: 150 }}
                  />
                  <input type="hidden" name="pos" value={pos} />
                </form>
                {POSITIONS.map((p) => (
                  <Link
                    key={p}
                    href={`/leagues/${slug}/draft?q=${encodeURIComponent(q)}&pos=${p}`}
                    className={`pill ${p === pos ? "on" : ""}`}
                    style={{ padding: "3px 9px", fontSize: 11 }}
                  >
                    {p}
                  </Link>
                ))}
              </span>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Pos</th>
                  <th>NFL</th>
                  <th className="r">Last szn</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {available.map((p) => (
                  <tr key={p.gsisId} className="hov">
                    <td className="tm">{p.name}</td>
                    <td>
                      <span className={`pos ${p.position}`}>{p.position}</span>
                    </td>
                    <td className="dim">{p.nflTeam}</td>
                    <td className="r num">{p.lastSeasonPts !== null ? fmt1(p.lastSeasonPts) : "—"}</td>
                    <td className="r">
                      <PickButton slug={slug} gsisId={p.gsisId} canPick={canPickNow} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-4">
            <div className="panel">
              <div className="ptitle">
                <span className="t">My queue</span>
                <span className="m">autopick order</span>
              </div>
              {myQueue.length === 0 ? (
                <p className="empty">Empty — autopick falls back to best available.</p>
              ) : (
                <ol className="flex flex-col">
                  {myQueue.map((item, i) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between border-b border-line px-[22px] py-2 text-[13.5px] last:border-b-0"
                    >
                      <span>
                        <span className="num mr-2 font-mono text-faint">{i + 1}.</span>
                        {playerNames.get(item.gsisId) ?? item.gsisId}
                      </span>
                      <QueueRemove slug={slug} queueId={item.id} />
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="panel">
              <div className="ptitle">
                <span className="t">Recent picks</span>
              </div>
              {recent.length === 0 ? (
                <p className="empty">No picks yet.</p>
              ) : (
                <ul className="flex flex-col">
                  {recent.map((p) => (
                    <li
                      key={p.id}
                      className="border-b border-line px-[22px] py-2 text-[13px] last:border-b-0"
                    >
                      <span className="num mr-2 font-mono text-xs text-faint">{p.overallPick}.</span>
                      <b>{playerNames.get(p.gsisId ?? "") ?? p.gsisId}</b>{" "}
                      <span className="text-muted">— {teamById.get(p.teamId)?.name}</span>
                      {p.isAutopick && <span className="ml-1 text-[11px] text-faint">(auto)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="panel mt-4">
        <div className="ptitle">
          <span className="t">Draft board</span>
          <Link href={`/leagues/${slug}/draft/board`} className="m">
            Full-screen board →
          </Link>
        </div>
        <div className="p-3">
          <DraftBoard
            teams={orderedTeams}
            picks={board}
            players={boardPlayers}
            currentPickId={draft.status === "complete" ? null : draft.currentPickId}
            myTeamId={ctx.myTeam?.id ?? null}
            compact
          />
        </div>
      </div>
      <div className="h-11" />
    </div>
  );
}
