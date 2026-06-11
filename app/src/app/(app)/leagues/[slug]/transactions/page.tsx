import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { players, teams, transactions, waiverClaims } from "@/lib/db/schema";
import { getLeagueForUser } from "@/lib/leagues/service";

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

  const typeLabel: Record<string, string> = {
    waiver: "Waiver",
    trade: "Trade",
    add: "Free agent",
    add_drop: "Free agent",
    drop: "Drop",
    draft: "Draft",
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
            {pending.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[22px] py-3 text-[13.5px] last:border-b-0"
              >
                <span>
                  <span className="text-muted">{teamName.get(c.teamId)}</span> claims{" "}
                  <b>{pn(c.addGsisId)}</b>
                  {c.dropGsisId && <span className="text-muted"> (dropping {pn(c.dropGsisId)})</span>}
                  {c.bidAmount !== null && (
                    <span className="num font-mono"> · ${c.bidAmount}</span>
                  )}
                </span>
                <span className="text-[11.5px] text-faint">
                  processes {c.processAfter.toLocaleString()}
                </span>
              </div>
            ))}
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
              <span className="flex items-center gap-3">
                <span className="display border border-line px-2 py-0.5 text-[10.5px] text-muted">
                  {typeLabel[t.type] ?? t.type}
                </span>
                <span className="text-muted">{t.teamId ? teamName.get(t.teamId) : "—"}</span>
                {t.addGsisId && <b>+{pn(t.addGsisId)}</b>}
                {t.dropGsisId && <span className="text-faint">−{pn(t.dropGsisId)}</span>}
              </span>
              <span className="text-[11.5px] text-faint">{t.createdAt.toLocaleString()}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
