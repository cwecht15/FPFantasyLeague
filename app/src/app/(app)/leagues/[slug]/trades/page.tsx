import { and, eq, isNull } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, rosterEntries, teams } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { listTrades } from "@/lib/trades/service";
import { RespondButtons, ResolveButtons } from "@/components/trade-buttons";
import { TradeProposer, type TradePlayer } from "@/components/trade-proposer";

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
  const byTeam = new Map<number, TradePlayer[]>();
  for (const r of rosterRows) {
    const arr = byTeam.get(r.teamId) ?? [];
    arr.push({ gsisId: r.gsisId, name: r.name, position: r.position });
    byTeam.set(r.teamId, arr);
  }

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, ctx.league.id))
    .orderBy(teams.id);
  const otherTeams = teamRows
    .filter((t) => t.id !== myTeamId)
    .map((t) => ({ ...t, roster: byTeam.get(t.id) ?? [] }));
  const myRoster = myTeamId ? (byTeam.get(myTeamId) ?? []) : [];

  const allTrades = await listTrades(ctx.league.id);

  const statusChip = (status: string) => {
    const cls =
      status === "applied"
        ? "bg-flame text-paper"
        : status === "proposed" || status === "accepted"
          ? "bg-surface text-paper border border-line"
          : "bg-pit text-faint border border-line";
    return (
      <span className={`display px-2.5 py-1 text-[11px] ${cls}`}>
        {STATUS_LABEL[status] ?? status}
      </span>
    );
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">{ctx.league.name}</div>
          <h1 className="display">Trades</h1>
          <div className="sub">
            Manager accepts, site admin approves — rosters swap on approval.
          </div>
        </div>
      </header>

      <div className="panel">
        <div className="ptitle">
          <span className="t">Trades</span>
        </div>
        {allTrades.length === 0 ? (
          <p className="empty">No trades yet.</p>
        ) : (
          <div>
            {allTrades.map(({ trade, proposingTeam, receivingTeam, give, get }) => (
              <div
                key={trade.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[22px] py-3.5 last:border-b-0"
              >
                <div className="text-[13.5px]">
                  <b>{proposingTeam}</b> <span className="text-muted">sends</span>{" "}
                  <b>{give.map((p) => `${p.name} (${p.position})`).join(", ") || "—"}</b>
                  <span className="text-muted"> · </span>
                  <b>{receivingTeam}</b> <span className="text-muted">sends</span>{" "}
                  <b>{get.map((p) => `${p.name} (${p.position})`).join(", ") || "—"}</b>
                  <div className="mt-1 text-[11.5px] text-faint">
                    {trade.createdAt.toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
                  {statusChip(trade.status)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-4" />
      {ctx.myTeam && (
        <TradeProposer slug={slug} myRoster={myRoster} otherTeams={otherTeams} />
      )}
    </div>
  );
}
