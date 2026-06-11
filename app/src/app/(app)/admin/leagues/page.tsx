import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { leagues, teams } from "@/lib/db/schema";
import { createLeagueAction, assignUserAction } from "@/lib/leagues/actions";
import { ActionForm } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { SCORING_PRESET_OPTIONS } from "@/lib/scoring/scoring-systems";

export const metadata = { title: "Manage Leagues — FP Fantasy League" };

export default async function AdminLeaguesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isSiteAdmin) redirect("/leagues");

  const rows = await db
    .select({
      league: leagues,
      claimed: sql<number>`count(${teams.id}) filter (where ${teams.ownerUserId} is not null)`,
      total: sql<number>`count(${teams.id})`,
    })
    .from(leagues)
    .leftJoin(teams, eq(teams.leagueId, leagues.id))
    .groupBy(leagues.id)
    .orderBy(leagues.createdAt);

  const statusChip = (status: string, isDemo: boolean) => {
    const label = isDemo ? `demo · ${status.replace("_", " ")}` : status.replace("_", " ");
    const cls =
      status === "in_season"
        ? "bg-flame text-paper"
        : status === "drafting"
          ? "bg-surface border border-line text-paper"
          : "bg-pit border border-line text-faint";
    return <span className={`display px-2.5 py-1 text-[11px] ${cls}`}>{label}</span>;
  };

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <h1 className="display">Manage leagues</h1>
          <div className="sub">
            Leagues are administered centrally — managers join by invite code or assignment.
          </div>
        </div>
      </header>

      <div className="panel">
        <div className="ptitle">
          <span className="t">All leagues</span>
        </div>
        {rows.length === 0 ? (
          <p className="empty">No leagues yet — create the first one below.</p>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>League</th>
                <th className="r">Season</th>
                <th className="r">Teams claimed</th>
                <th>Status</th>
                <th>Invite code</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ league, claimed, total }) => (
                <tr key={league.id} className="hov">
                  <td className="tm">{league.name}</td>
                  <td className="r num">{league.season}</td>
                  <td className="r num">
                    {Number(claimed)} / {league.numTeams}
                    {Number(total) > league.numTeams && (
                      <span className="dim"> ({Number(total)} made)</span>
                    )}
                  </td>
                  <td>{statusChip(league.status, league.isDemo)}</td>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="num font-mono text-flame">{league.inviteCode}</span>
                      <CopyButton text={league.inviteCode} toast="Invite code copied" />
                    </span>
                  </td>
                  <td className="r">
                    <Link href={`/leagues/${league.slug}`} className="btn2">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="panel">
          <div className="ptitle">
            <span className="t">Create a league</span>
          </div>
          <div className="px-[22px] py-4">
            <ActionForm action={createLeagueAction} submitLabel="Create league">
              <div className="field">
                <label>League name</label>
                <input name="name" required minLength={3} maxLength={60} className="input" />
              </div>
              <div className="flex gap-3">
                <div className="field flex-1">
                  <label>Teams</label>
                  <select name="numTeams" defaultValue="12" className="input">
                    {[4, 6, 8, 10, 12, 14, 16, 18, 20].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field flex-1">
                  <label>Scoring preset</label>
                  <select name="scoringPreset" defaultValue="fp_advanced" className="input">
                    {SCORING_PRESET_OPTIONS.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </ActionForm>
          </div>
        </div>

        <div className="panel">
          <div className="ptitle">
            <span className="t">Assign a manager</span>
          </div>
          <div className="px-[22px] py-4">
            <p className="note mb-3">
              Enroll a registered user — they get the first unclaimed team (or a new one).
            </p>
            <ActionForm action={assignUserAction} submitLabel="Assign" successMessage="Manager assigned">
              <div className="field">
                <label>League</label>
                <select name="slug" className="input" required>
                  {rows
                    .filter((r) => !r.league.isDemo)
                    .map((r) => (
                      <option key={r.league.id} value={r.league.slug}>
                        {r.league.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <label>User email</label>
                <input name="email" type="email" required className="input" />
              </div>
              <div className="field">
                <label>Team name (optional)</label>
                <input name="teamName" maxLength={40} className="input" />
              </div>
            </ActionForm>
          </div>
        </div>
      </div>
      <div className="h-11" />
    </div>
  );
}
