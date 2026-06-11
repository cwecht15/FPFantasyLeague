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

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

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
      <div className="flex flex-col gap-4">
        <p className="text-muted">The draft hasn&apos;t started yet.</p>
        {admin && (
          <div className="max-w-md rounded-lg border border-line p-5">
            <h3 className="font-semibold">Start the draft</h3>
            <p className="mt-1 text-sm text-muted">
              Uses the league&apos;s draft config (order, rounds, clock). All teams must be
              claimed.
            </p>
            <div className="mt-3">
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
    .select({ id: teams.id, name: teams.name, ownerUserId: teams.ownerUserId, draftPosition: teams.draftPosition })
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
    <div className="flex flex-col gap-6">
      {(draft.status === "in_progress" || draft.status === "paused") && <PollRefresher />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-4">
        <div>
          {draft.status === "complete" ? (
            <span className="font-semibold text-paper/80">Draft complete</span>
          ) : current ? (
            <>
              <span className="text-sm text-muted">
                Round {current.round}, pick {current.overallPick} —{" "}
              </span>
              <span className="font-semibold">{currentTeam?.name}</span>
              {myTurn && <span className="ml-2 rounded bg-flame px-2 py-0.5 text-xs font-bold">YOUR PICK</span>}
              <span className="ml-3 text-sm text-muted">
                <Countdown deadline={current.deadlineAt ? current.deadlineAt.toISOString() : null} />
              </span>
              {draft.status === "paused" && (
                <span className="ml-2 rounded bg-surface px-2 py-0.5 text-xs font-bold text-paper">PAUSED</span>
              )}
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/leagues/${slug}/draft/board`}
            className="btn-flame rounded-md px-4 py-2 text-xs uppercase tracking-wide"
          >
            Draft board
          </Link>
          {admin && draft.status !== "complete" && (
            <ActionForm
              action={pauseDraftAction}
              submitLabel={draft.status === "paused" ? "Resume" : "Pause"}
              className="flex items-center gap-2"
            >
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="paused" value={draft.status === "paused" ? "false" : "true"} />
            </ActionForm>
          )}
        </div>
      </div>

      {draft.status !== "complete" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="label text-sm">
                Available players
              </h3>
              <form action={`/leagues/${slug}/draft`} method="get" className="flex items-center gap-2">
                <input
                  name="q"
                  defaultValue={q}
                  placeholder="Search…"
                  className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm"
                />
                <input type="hidden" name="pos" value={pos} />
                <button className="rounded border border-line-strong px-2 py-1 text-xs hover:bg-surface">
                  Go
                </button>
              </form>
              <div className="flex gap-1">
                {POSITIONS.map((p) => (
                  <Link
                    key={p}
                    href={`/leagues/${slug}/draft?q=${encodeURIComponent(q)}&pos=${p}`}
                    className={`rounded px-2 py-1 text-xs ${
                      p === pos
                        ? "bg-paper font-semibold text-ink"
                        : "border border-line text-muted hover:bg-surface"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
              </div>
            </div>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line-strong text-left text-xs text-faint">
                  <th className="px-2 py-1.5">Player</th>
                  <th className="px-2 py-1.5">Pos</th>
                  <th className="px-2 py-1.5">NFL</th>
                  <th className="px-2 py-1.5 text-right">Last szn</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {available.map((p) => (
                  <tr key={p.gsisId} className="border-b border-line hover:bg-pit">
                    <td className="px-2 py-1.5">{p.name}</td>
                    <td className="px-2 py-1.5">{p.position}</td>
                    <td className="px-2 py-1.5 text-muted">{p.nflTeam}</td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {p.lastSeasonPts !== null ? p.lastSeasonPts.toFixed(1) : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <PickButton slug={slug} gsisId={p.gsisId} canPick={canPickNow} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="flex flex-col gap-6">
            <div>
              <h3 className="label text-sm">
                My queue (autopick order)
              </h3>
              {myQueue.length === 0 ? (
                <p className="mt-2 text-sm text-faint">
                  Empty — autopick falls back to best available.
                </p>
              ) : (
                <ol className="mt-2 flex flex-col gap-1 text-sm">
                  {myQueue.map((item, i) => (
                    <li key={item.id} className="flex items-center justify-between rounded border border-line px-2 py-1">
                      <span>
                        <span className="mr-2 text-faint">{i + 1}.</span>
                        {playerNames.get(item.gsisId) ?? item.gsisId}
                      </span>
                      <QueueRemove slug={slug} queueId={item.id} />
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div>
              <h3 className="label text-sm">
                Recent picks
              </h3>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {recent.map((p) => (
                  <li key={p.id} className="text-paper/80">
                    <span className="mr-1 font-mono text-xs text-faint">{p.overallPick}.</span>
                    {playerNames.get(p.gsisId ?? "") ?? p.gsisId} —{" "}
                    <span className="text-muted">{teamById.get(p.teamId)?.name}</span>
                    {p.isAutopick && <span className="ml-1 text-xs text-faint">(auto)</span>}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h3 className="display text-xl">Draft board</h3>
          <Link href={`/leagues/${slug}/draft/board`} className="text-xs font-bold text-muted hover:text-paper">
            Full-screen board →
          </Link>
        </div>
        <div className="mt-3">
          <DraftBoard
            teams={orderedTeams}
            picks={board}
            players={boardPlayers}
            currentPickId={draft.status === "complete" ? null : draft.currentPickId}
            compact
          />
        </div>
      </section>
    </div>
  );
}
