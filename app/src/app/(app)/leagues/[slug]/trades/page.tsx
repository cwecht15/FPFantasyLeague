import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, rosterEntries, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { listTrades } from "@/lib/trades/service";
import { proposeTradeAction } from "@/lib/trades/actions";
import { ActionForm } from "@/components/action-form";
import { RespondButtons, ResolveButtons } from "@/components/trade-buttons";

const STATUS_LABEL: Record<string, string> = {
  proposed: "awaiting manager",
  accepted: "awaiting admin approval",
  applied: "completed",
  rejected: "rejected",
  vetoed: "vetoed",
  expired: "expired",
};

export default async function TradesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();
  const admin = session.user.isSiteAdmin;
  const myTeamId = ctx.myTeam?.id ?? null;

  // All active rosters in the league, grouped by team.
  const rosterRows = await db
    .select({
      teamId: rosterEntries.teamId,
      gsisId: rosterEntries.gsisId,
      name: players.displayName,
      position: players.position,
    })
    .from(rosterEntries)
    .innerJoin(players, eq(players.gsisId, rosterEntries.gsisId))
    .where(and(eq(rosterEntries.leagueId, ctx.league.id), isNull(rosterEntries.droppedAt)))
    .orderBy(players.position, players.displayName);
  const byTeam = new Map<number, typeof rosterRows>();
  for (const r of rosterRows) {
    const arr = byTeam.get(r.teamId) ?? [];
    arr.push(r);
    byTeam.set(r.teamId, arr);
  }

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, ctx.league.id))
    .orderBy(teams.id);
  const otherTeams = teamRows.filter((t) => t.id !== myTeamId);
  const myRoster = myTeamId ? (byTeam.get(myTeamId) ?? []) : [];

  const allTrades = await listTrades(ctx.league.id);

  const selectClass =
    "min-h-40 w-full rounded-md border border-line-strong bg-surface px-2 py-1 text-sm";

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="display text-xl">Trades</h2>
        {allTrades.length === 0 ? (
          <p className="mt-3 text-muted">No trades yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {allTrades.map(({ trade, proposingTeam, receivingTeam, give, get }) => (
              <li key={trade.id} className="rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-bold">{proposingTeam}</span>
                    <span className="text-muted"> sends </span>
                    {give.map((p) => `${p.name} (${p.position})`).join(", ") || "—"}
                    <span className="text-muted"> · </span>
                    <span className="font-bold">{receivingTeam}</span>
                    <span className="text-muted"> sends </span>
                    {get.map((p) => `${p.name} (${p.position})`).join(", ") || "—"}
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-bold ${
                      trade.status === "applied"
                        ? "bg-flame text-paper"
                        : trade.status === "proposed" || trade.status === "accepted"
                          ? "bg-surface text-paper"
                          : "bg-pit text-faint"
                    }`}
                  >
                    {STATUS_LABEL[trade.status] ?? trade.status}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {trade.status === "proposed" &&
                    myTeamId !== null &&
                    (trade.receivingTeamId === myTeamId || trade.proposingTeamId === myTeamId) && (
                      <RespondButtons
                        slug={slug}
                        tradeId={trade.id}
                        canAccept={trade.receivingTeamId === myTeamId}
                      />
                    )}
                  {trade.status === "accepted" && admin && (
                    <ResolveButtons slug={slug} tradeId={trade.id} />
                  )}
                  <span className="text-xs text-faint">
                    {trade.createdAt.toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {ctx.myTeam && (
        <section>
          <h2 className="display text-xl">Propose a trade</h2>
          <p className="mt-2 text-sm text-muted">
            Pick a team, select players from each side (Ctrl/Cmd-click for multiple), and
            send it. The other manager accepts, then a site admin approves.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {otherTeams.map((t) => (
              <details key={t.id} className="rounded-lg border border-line p-4">
                <summary className="cursor-pointer font-bold">{t.name}</summary>
                <div className="mt-4">
                  <ActionForm action={proposeTradeAction} submitLabel="Propose trade" successMessage="Trade proposed">
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="receivingTeamId" value={t.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-sm">
                        You send
                        <select name="give" multiple className={selectClass}>
                          {myRoster.map((p) => (
                            <option key={p.gsisId} value={p.gsisId}>
                              {p.name} ({p.position})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-sm">
                        You receive
                        <select name="get" multiple className={selectClass}>
                          {(byTeam.get(t.id) ?? []).map((p) => (
                            <option key={p.gsisId} value={p.gsisId}>
                              {p.name} ({p.position})
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </ActionForm>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
