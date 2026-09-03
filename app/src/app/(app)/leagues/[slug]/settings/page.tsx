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
import { cardGroups, presetLabel, scoringCardSections } from "@/lib/scoring/rules-card";
import { nextWeeklyEt, WAIVER_DOW, WAIVER_HOUR_ET } from "@/lib/transactions/game-lock";

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

  // ---- "How this league works" copy, derived from the live configs ----
  const wc = settings.waiverConfig;
  const pc = settings.playoffConfig;
  const dc = settings.draftConfig;
  const waiverRun = nextWeeklyEt(wc.processDow ?? WAIVER_DOW, wc.processHourEt ?? WAIVER_HOUR_ET);
  const waiverRunLabel = waiverRun.toLocaleString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const lastRegWeek = Math.max(1, pc.startWeek - 1);
  const playoffLastWeek = pc.startWeek + Math.ceil(Math.log2(Math.max(2, pc.teams))) - 1;

  const howItWorks: [string, string][] = [
    [
      "Free agency",
      wc.mode === "none"
        ? "Open free agency — adds apply instantly, first come first served."
        : "Any player is an instant add until their NFL game kicks off. From kickoff they're locked wherever they are — lineup, bench, or free-agent pool — until waivers process.",
    ],
    ...(wc.mode === "faab"
      ? ([
          [
            "Waivers",
            `Locked free agents take blind bids from a $${wc.faabBudget ?? 100} season budget. ` +
              `Claims process ${waiverRunLabel} ET each week — highest bid wins, ties go to the ` +
              `worse record, and the budget only spends when you win. Afterward everyone ` +
              `unclaimed is a free agent again.`,
          ],
        ] as [string, string][])
      : []),
    [
      "Lineups",
      "Set your lineup any time before kickoff — each slot locks individually when that player's game starts. Scores post Tuesday 6:00 AM ET after charting; no live scoring.",
    ],
    [
      "Schedule",
      `Round-robin head-to-head, weeks 1–${lastRegWeek}.${league.numTeams % 2 === 1 ? " Odd team count — one team is on bye each week." : ""}`,
    ],
    [
      "Playoffs",
      `Top ${pc.teams} by wins make the bracket — points for breaks ties — over weeks ` +
        `${pc.startWeek}–${playoffLastWeek}. Top seeds bye the first round when the field ` +
        `isn't a power of two; every round re-seeds best vs worst, the higher seed hosts, ` +
        `and a tied playoff game advances the higher seed.`,
    ],
    [
      "Draft",
      `${dc.rounds}-round snake${dc.thirdRoundReversal ? " with 3rd-round reversal" : ""}, ` +
        (dc.secondsPerPick > 0
          ? `${dc.secondsPerPick} seconds per pick.`
          : "no pick clock — slow draft, picks never expire."),
    ],
    ["Trades", "Not part of this platform — rosters change via the draft, free agency, and waivers."],
  ];

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
          <span className="t">How this league works</span>
        </div>
        <table className="tbl">
          <tbody>
            {howItWorks.map(([label, copy]) => (
              <tr key={label}>
                <td className="dim" style={{ width: 110, verticalAlign: "top" }}>
                  {label}
                </td>
                <td style={{ fontSize: 13 }}>{copy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel mt-4">
        <div className="ptitle">
          <span className="t">Scoring — {presetLabel(settings.scoringRules)}</span>
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
            {scoringCardSections(settings.scoringRules)
              .filter((sec) => sec.rows.length > 0)
              .map((sec) => (
                <>
                  <tr key={`h-${sec.title}`}>
                    <td colSpan={2} className="!pb-1 !pt-4">
                      <span className="label">{sec.title}</span>
                      {sec.positions && (
                        <span className="ml-2 text-[10.5px] text-faint">{sec.positions}</span>
                      )}
                    </td>
                  </tr>
                  {sec.rows.map((row) => (
                    <tr key={`${sec.title}-${row.group}-${row.label}`}>
                      <td className="dim">
                        {cardGroups(sec.rows).length > 1 && row.group && (
                          <span className="mr-2 text-[10px] text-faint">{row.group} ·</span>
                        )}
                        {row.label}
                      </td>
                      <td className="r num">{row.value}</td>
                    </tr>
                  ))}
                </>
              ))}
          </tbody>
        </table>
        <p className="note px-[22px] py-3">
          Only components that score points are listed. Points come from post-game charting —
          results post Tuesday 6:00 AM ET, final Thursday noon.
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
              className="flex flex-wrap items-end gap-3"
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
                  className="input w-full max-w-[280px]"
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
