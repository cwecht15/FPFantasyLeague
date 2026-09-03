import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, teams, transactions, waiverClaims } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";
import { CancelClaimButton } from "@/components/player-row-actions";
import { PlayerName } from "@/components/player-log";

const fmtEt = (d: Date) =>
  d.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " ET";

export default async function TransactionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.leagueId, ctx.league.id));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));

  const nameRows = await db
    .select({ gsisId: players.gsisId, name: players.displayName })
    .from(players);
  const playerName = new Map(nameRows.map((p) => [p.gsisId, p.name]));
  const pn = (id: string | null) => (id ? (playerName.get(id) ?? id) : null);

  const pending = await db
    .select()
    .from(waiverClaims)
    .where(and(eq(waiverClaims.leagueId, ctx.league.id), eq(waiverClaims.status, "pending")))
    .orderBy(waiverClaims.processAfter, waiverClaims.id);

  const history = await db
    .select()
    .from(transactions)
    .where(eq(transactions.leagueId, ctx.league.id))
    .orderBy(desc(transactions.createdAt))
    .limit(100);

  // Say what the move was, plainly: Add / Drop / Add + Drop / Waiver win / …
  const typeLabel: Record<string, string> = {
    waiver: "Waiver win",
    trade: "Trade",
    add: "Add",
    add_drop: "Add + Drop",
    drop: "Drop",
    draft: "Draft pick",
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">{ctx.league.name}</div>
          <h1 className="display">Transactions</h1>
        </div>
      </header>

      {pending.length > 0 && (
        <>
          <div className="panel">
            <div className="ptitle">
              <span className="t">Pending waiver claims</span>
            </div>
            {pending.map((c) => {
              const mine = ctx.myTeam?.id === c.teamId;
              return (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[22px] py-3 text-[13.5px] last:border-b-0"
                >
                  <span>
                    <span className="text-muted">{teamName.get(c.teamId)}</span> claims{" "}
                    <b>{pn(c.addGsisId)}</b>
                    {c.dropGsisId && (
                      <span className="text-muted"> (dropping {pn(c.dropGsisId)})</span>
                    )}
                    {mine && c.bidAmount !== null && (
                      <span className="num font-mono"> · ${c.bidAmount}</span>
                    )}
                  </span>
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="text-[11.5px] text-faint">
                      processes {fmtEt(c.processAfter)}
                    </span>
                    {mine && <CancelClaimButton slug={slug} claimId={c.id} />}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="h-4" />
        </>
      )}

      <div className="panel">
        <div className="ptitle">
          <span className="t">History</span>
        </div>
        {history.length === 0 ? (
          <p className="empty">No transactions yet.</p>
        ) : (
          history.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[22px] py-3 text-[13.5px] last:border-b-0"
            >
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="display border border-line px-2 py-0.5 text-[10.5px] text-muted">
                  {typeLabel[t.type] ?? t.type}
                </span>
                <span className="text-muted">{t.teamId ? teamName.get(t.teamId) : "—"}</span>
                {t.addGsisId && (
                  <b>
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.1em] text-flame">
                      Add{" "}
                    </span>
                    <PlayerName slug={slug} gsisId={t.addGsisId} name={pn(t.addGsisId)!} />
                  </b>
                )}
                {t.dropGsisId && (
                  <span className="text-faint">
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.1em]">
                      Drop{" "}
                    </span>
                    <PlayerName slug={slug} gsisId={t.dropGsisId} name={pn(t.dropGsisId)!} />
                  </span>
                )}
              </span>
              <span className="text-[11.5px] text-faint">{fmtEt(t.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
