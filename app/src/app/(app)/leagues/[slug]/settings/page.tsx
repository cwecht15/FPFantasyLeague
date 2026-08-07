import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import {
  assignUserAction,
  generateScheduleAction,
  renameTeamAction,
  updateScoringAction,
} from "@/lib/leagues/actions";
import { ActionForm } from "@/components/action-form";
import { RuleFieldsets } from "@/components/rules-fields";
import { CopyButton } from "@/components/copy-button";
import { groupsFromRules } from "@/lib/scoring/lab-form";
import type { ScoringRules } from "@/lib/scoring/scoring-systems";

/** Flat rule/value rows for the manager's read-only scoring table. */
function ruleRows(r: ScoringRules): [string, string][] {
  const rows: [string, string][] = [
    ["Passing yards", `1 pt / ${r.passYdsPerPoint} yds`],
    ["Passing TD", String(r.passTd)],
    ["Interception", String(r.interception)],
    ["Rushing yards", `1 pt / ${r.rushYdsPerPoint} yds`],
    ["Rushing TD", String(r.rushTd)],
    ["Reception", String(r.reception)],
    ["Receiving yards", `1 pt / ${r.recYdsPerPoint} yds`],
    ["Receiving TD", String(r.recTd)],
    ["Fumble lost", String(r.fumbleLost)],
  ];
  const a = r.advanced;
  if (a?.missedTackleForced) rows.push(["Missed tackle forced (RB)", String(a.missedTackleForced)]);
  if (a?.deepPassYd) rows.push(["Pass yds 5+ air", `${a.deepPassYd} / yd`]);
  if (a?.deepPassFirstDown) rows.push(["Passing 1st down (5+ air)", String(a.deepPassFirstDown)]);
  if (a?.deepPassTd) rows.push(["Passing TD (5+ air)", String(a.deepPassTd)]);
  if (a?.sackTaken) rows.push(["Sack taken", String(a.sackTaken)]);
  if (a?.epaPerDropback) rows.push(["EPA / dropback ×", String(a.epaPerDropback)]);
  if (a?.epaTotal) rows.push(["EPA total ×", String(a.epaTotal)]);
  if (a?.recFirstRead) rows.push(["First-read target", String(a.recFirstRead)]);
  if (r.xfp) {
    for (const [label, key] of [["QB", "qb"], ["RB", "rb"], ["WR", "wr"], ["TE", "te"]] as const) {
      if (r.xfp[key]) rows.push([`xFP × ${label}`, String(r.xfp[key])]);
    }
  }
  return rows;
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const ctx = await getLeagueForUser(slug, session.user.id);
  if (!ctx) notFound();

  const league = ctx.league;
  const settings = await getSettings(league.id);
  const admin = session.user.isSiteAdmin;

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">{league.name}</div>
          <h1 className="display">Settings</h1>
          <div className="sub">
            Read-only. Leagues are administered centrally — settings changes re-score every
            posted week automatically.
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="panel">
          <div className="ptitle">
            <span className="t">League</span>
          </div>
          <table className="tbl">
            <tbody>
              <tr>
                <td className="dim">Name</td>
                <td className="r tm">{league.name}</td>
              </tr>
              <tr>
                <td className="dim">Season</td>
                <td className="r num">{league.season}</td>
              </tr>
              <tr>
                <td className="dim">Teams</td>
                <td className="r num">{league.numTeams}</td>
              </tr>
              <tr>
                <td className="dim">Status</td>
                <td className="r">{league.status.replace("_", " ")}</td>
              </tr>
              {admin && (
                <tr>
                  <td className="dim">Invite code</td>
                  <td className="r">
                    <span className="num font-mono text-flame">{league.inviteCode}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="ptitle">
            <span className="t">Roster template</span>
          </div>
          <table className="tbl">
            <tbody>
              {settings.rosterTemplate.slots.map((s) => (
                <tr key={s.slot}>
                  <td className="dim">{s.slot}</td>
                  <td className="r num">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel mt-4">
        <div className="ptitle">
          <span className="t">Scoring — {settings.scoringRules.preset === "fp_advanced" ? "FP Advanced" : (settings.scoringRules.preset ?? "custom").toUpperCase()}</span>
          <span className="flex items-center gap-4">
            <Link href={`/leagues/${slug}/scoring-card`} className="m">
              Full card / export →
            </Link>
            {admin && (
              <Link href="/admin/scoring-lab" className="m">
                Edit scoring in the Lab →
              </Link>
            )}
          </span>
        </div>
        <table className="tbl">
          <tbody>
            {ruleRows(settings.scoringRules).map(([rule, value]) => (
              <tr key={rule}>
                <td className="dim">{rule}</td>
                <td className="r num">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note px-[22px] py-3">
          Points come from post-game charting — results post Tuesday 6:00 AM ET, final
          Thursday noon.
        </p>
      </div>

      {ctx.myTeam && (
        <div className="panel mt-4">
          <div className="ptitle">
            <span className="t">My team</span>
          </div>
          <div className="px-[22px] py-4">
            <ActionForm
              action={renameTeamAction}
              submitLabel="Rename"
              successMessage="Saved"
              className="flex items-end gap-3"
            >
              <input type="hidden" name="slug" value={slug} />
              <label className="field !mb-0">
                <span className="field-label label">Team name</span>
                <input
                  name="teamName"
                  defaultValue={ctx.myTeam.name}
                  required
                  minLength={2}
                  maxLength={40}
                  className="input"
                  style={{ width: 280 }}
                />
              </label>
            </ActionForm>
          </div>
        </div>
      )}

      {admin && (
        <div className="panel mt-4">
          <div className="ptitle">
            <span className="t">Admin controls</span>
          </div>
          <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
            <div className="px-[22px] py-4">
              <div className="label mb-2">Invite managers</div>
              <div className="flex items-center gap-2.5">
                <span className="num font-mono text-flame">{league.inviteCode}</span>
                <CopyButton text={league.inviteCode} toast="Invite code copied" />
              </div>
              <p className="note mt-2">New managers paste this on the join screen.</p>
            </div>
            <div className="px-[22px] py-4">
              <div className="label mb-2">Assign a manager</div>
              <ActionForm action={assignUserAction} submitLabel="Assign" successMessage="Manager assigned">
                <input type="hidden" name="slug" value={slug} />
                <input name="email" type="email" required placeholder="user@email.com" className="input" />
                <input name="teamName" maxLength={40} placeholder="Team name (optional)" className="input" />
              </ActionForm>
            </div>
            <div className="px-[22px] py-4">
              <div className="label mb-2">Schedule</div>
              <ActionForm
                action={generateScheduleAction}
                submitLabel="Generate schedule"
                successMessage="Schedule generated"
              >
                <input type="hidden" name="slug" value={slug} />
              </ActionForm>
              <p className="note mt-2">Replaces regular-season matchups — setup only.</p>
            </div>
          </div>
        </div>
      )}

      {admin && (
        <div className="panel mt-4">
          <div className="ptitle">
            <span className="t">Scoring rules (edit)</span>
          </div>
          <div className="px-[22px] py-4">
            <ActionForm
              action={updateScoringAction}
              submitLabel="Save scoring"
              successMessage="Saved — re-score queued"
              className="flex flex-col gap-5"
            >
              <input type="hidden" name="slug" value={slug} />
              {(() => {
                const { groups, scope } = groupsFromRules(settings.scoringRules);
                return <RuleFieldsets groups={groups} scope={scope} />;
              })()}
            </ActionForm>
          </div>
        </div>
      )}
      <div className="h-11" />
    </div>
  );
}
