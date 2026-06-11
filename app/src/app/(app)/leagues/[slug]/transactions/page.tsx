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

  return (
    <div className="flex flex-col gap-8">
      {pending.length > 0 && (
        <section>
          <h2 className="display text-xl">Pending waiver claims</h2>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {pending.map((c) => (
              <li key={c.id} className="rounded border border-line px-3 py-1.5">
                <span className="text-muted">{teamName.get(c.teamId)}</span> claims{" "}
                <span className="font-medium">{pn(c.addGsisId)}</span>
                {c.dropGsisId && <> (dropping {pn(c.dropGsisId)})</>}
                {c.bidAmount !== null && <> — bid ${c.bidAmount}</>}
                <span className="ml-2 text-xs text-faint">
                  processes {c.processAfter.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="display text-xl">Transaction history</h2>
        {history.length === 0 ? (
          <p className="mt-3 text-muted">No transactions yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {history.map((t) => (
              <li key={t.id} className="rounded border border-line px-3 py-1.5">
                <span className="mr-2 rounded bg-surface px-1.5 py-0.5 text-xs uppercase text-muted">
                  {t.type}
                </span>
                <span className="text-muted">{t.teamId ? teamName.get(t.teamId) : "—"}</span>
                {t.addGsisId && (
                  <>
                    {" "}
                    + <span className="font-medium">{pn(t.addGsisId)}</span>
                  </>
                )}
                {t.dropGsisId && (
                  <>
                    {" "}
                    − <span className="font-medium">{pn(t.dropGsisId)}</span>
                  </>
                )}
                <span className="ml-2 text-xs text-faint">
                  {t.createdAt.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
