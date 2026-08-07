import Link from "next/link";
import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, rosterEntries, teams } from "@/lib/db/schema";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import { ACTIVE_POSITIONS } from "@/lib/leagues/settings";
import { getDraft, getDraftBoard, listAvailable } from "@/lib/draft/service";
import { listMyQueue, pauseDraftAction, startDraftAction } from "@/lib/draft/actions";
import { ActionForm } from "@/components/action-form";
import { Countdown, PickButton, PollRefresher, QueueRemove } from "@/components/draft-client";
import { DraftBoard, type BoardPlayer } from "@/components/draft-board";
import { fmt1 } from "@/lib/format";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "COACH"];

/** Per-position cap in the grouped "ALL" view, so one deep position can't
 *  crowd out the others. A specific position filter shows a full list. */
const PER_POSITION = 12;

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; pos?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const { q = "", pos = "ALL", sort: sortParam } = await searchParams;
  const sort = sortParam === "ppg" ? "ppg" : "pts";
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
      ? await listAvailable(ctx.league.id, ctx.league.season, {
          q,
          pos,
          sort,
          limit: pos === "ALL" ? 200 : 80,
        })
      : [];

  // Group by position for the "ALL" view; a single-position filter is one group.
  const groups: { position: string; players: typeof available }[] =
    pos === "ALL"
      ? POSITIONS.filter((p) => p !== "ALL")
          .map((p) => ({
            position: p,
            players: available.filter((a) => a.position === p).slice(0, PER_POSITION),
          }))
          .filter((g) => g.players.length > 0)
      : [{ position: pos, players: available }];

  // My roster so far, in draft order, for the side panel.
  const myRoster = ctx.myTeam
    ? await db
        .select({
          gsisId: rosterEntries.gsisId,
          name: players.displayName,
          position: players.position,
          nflTeam: players.nflTeam,
        })
        .from(rosterEntries)
        .innerJoin(players, eq(players.gsisId, rosterEntries.gsisId))
        .where(
          and(eq(rosterEntries.teamId, ctx.myTeam.id), isNull(rosterEntries.droppedAt)),
        )
        .orderBy(rosterEntries.id)
    : [];
  const rosterByPos = new Map<string, typeof myRoster>();
  for (const r of myRoster) {
    rosterByPos.set(r.position, [...(rosterByPos.get(r.position) ?? []), r]);
  }
  // Starter requirement per position (FLEX/BENCH aren't position-specific) and
  // the total roster size, both from the league's template.
  const settings = await getSettings(ctx.league.id);
  const starterNeeds = new Map<string, number>(
    settings.rosterTemplate.slots
      .filter((s) => (ACTIVE_POSITIONS as readonly string[]).includes(s.slot))
      .map((s) => [s.slot, s.count]),
  );
  const rosterSize = settings.rosterTemplate.slots.reduce((n, s) => n + s.count, 0);

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
                  <input type="hidden" name="sort" value={sort} />
                </form>
                {POSITIONS.map((p) => (
                  <Link
                    key={p}
                    href={`/leagues/${slug}/draft?q=${encodeURIComponent(q)}&pos=${p}&sort=${sort}`}
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
                  <th style={{ width: 44 }}>#</th>
                  <th>Player</th>
                  <th>NFL</th>
                  <th className="r" title={`Games played in ${ctx.league.season - 1}`}>
                    G
                  </th>
                  <th className="r">
                    <Link
                      href={`/leagues/${slug}/draft?q=${encodeURIComponent(q)}&pos=${pos}&sort=pts`}
                      className={sort === "pts" ? "text-flame" : ""}
                      title={`${ctx.league.season - 1} total points under this league's scoring — click to sort`}
                    >
                      FPTS{sort === "pts" ? " ▼" : ""}
                    </Link>
                  </th>
                  <th className="r">
                    <Link
                      href={`/leagues/${slug}/draft?q=${encodeURIComponent(q)}&pos=${pos}&sort=ppg`}
                      className={sort === "ppg" ? "text-flame" : ""}
                      title={`${ctx.league.season - 1} points per game — click to sort`}
                    >
                      FPTS/G{sort === "ppg" ? " ▼" : ""}
                    </Link>
                  </th>
                  <th></th>
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.position}>
                  <tr>
                    <td colSpan={7} className="bg-surface !py-1.5">
                      <span className="label !text-paper">{g.position}</span>
                      <span className="ml-2 text-[11px] text-faint">
                        {g.players.length} shown
                        {pos === "ALL" && g.players.length === PER_POSITION && (
                          <>
                            {" · "}
                            <Link
                              href={`/leagues/${slug}/draft?q=${encodeURIComponent(q)}&pos=${g.position}&sort=${sort}`}
                              className="underline"
                            >
                              see all
                            </Link>
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                  {g.players.map((p) => (
                    <tr key={p.gsisId} className="hov">
                      <td className="rk">
                        {p.position}
                        {p.posRank}
                      </td>
                      <td className="tm">{p.name}</td>
                      <td className="dim">{p.nflTeam}</td>
                      <td className="r num dim">{p.games || "—"}</td>
                      <td className="r num">
                        {p.lastSeasonPts !== null ? fmt1(p.lastSeasonPts) : "—"}
                      </td>
                      <td className="r num" style={{ fontWeight: 800 }}>
                        {p.ppg !== null ? fmt1(p.ppg) : "—"}
                      </td>
                      <td className="r">
                        <PickButton slug={slug} gsisId={p.gsisId} canPick={canPickNow} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
            {groups.length === 0 && <p className="empty">No players match.</p>}
          </div>

          <div className="flex flex-col gap-4">
            {ctx.myTeam && (
              <div className="panel">
                <div className="ptitle">
                  <span className="t">My roster</span>
                  <span className="m">
                    {myRoster.length} / {rosterSize}
                  </span>
                </div>
                <table className="tbl">
                  <tbody>
                    {ACTIVE_POSITIONS.map((slotPos) => {
                      const picked = rosterByPos.get(slotPos) ?? [];
                      const need = starterNeeds.get(slotPos) ?? 0;
                      const short = picked.length < need;
                      return (
                        <tr key={slotPos}>
                          <td style={{ width: 52 }}>
                            <span className={`pos ${slotPos}`}>{slotPos}</span>
                          </td>
                          <td>
                            {picked.length === 0 ? (
                              <span className="text-faint">—</span>
                            ) : (
                              picked.map((r) => r.name).join(", ")
                            )}
                          </td>
                          <td className="r num" style={short ? { color: "var(--color-flame)" } : undefined}>
                            {picked.length}/{need}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="note px-[22px] py-2">
                  Counts are starters needed (FLEX and bench fill from anywhere).
                </p>
              </div>
            )}

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
