import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getLeagueForUser, getSettings } from "@/lib/leagues/service";
import {
  updateConfigsAction,
  updateRosterAction,
  updateScoringAction,
} from "@/lib/leagues/actions";
import { ActionForm } from "@/components/action-form";
import { RuleFieldsets } from "@/components/rules-fields";
import { ACTIVE_SLOTS } from "@/lib/leagues/settings";
import { groupsFromRules } from "@/lib/scoring/lab-form";

const inputClass =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-paper focus:outline-none";

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

  const settings = await getSettings(ctx.league.id);
  // Leagues are administered centrally — only site admins edit settings.
  const admin = session.user.isSiteAdmin;
  const slotCounts = new Map(settings.rosterTemplate.slots.map((s) => [s.slot, s.count]));

  if (!admin) {
    return (
      <div className="flex flex-col gap-6">
        <section>
          <h2 className="display text-xl">Scoring</h2>
          <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-pit p-4 text-xs text-paper/80">
            {JSON.stringify(settings.scoringRules, null, 2)}
          </pre>
        </section>
        <section>
          <h2 className="display text-xl">Roster</h2>
          <p className="mt-2 text-sm text-muted">
            {settings.rosterTemplate.slots.map((s) => `${s.count} ${s.slot}`).join(" · ")}
          </p>
        </section>
        <p className="text-sm text-faint">League settings are managed by the site admins.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <p className="text-sm text-muted">
        Settings version {settings.version}. Scoring or roster edits trigger an automatic
        re-score of all weeks.
      </p>

      <section className="rounded-lg border border-line p-5">
        <h2 className="display text-xl">Scoring rules</h2>
        <p className="mt-1 text-sm text-muted">
          Same inputs as the Scoring Lab, pre-filled with this league&apos;s current values.
          Saving re-scores every pushed week automatically.
        </p>
        <div className="mt-4">
          <ActionForm
            action={updateScoringAction}
            submitLabel="Save scoring"
            successMessage="Saved — re-score queued"
            className="flex flex-col gap-5"
          >
            <input type="hidden" name="slug" value={slug} />
            {(() => {
              const { groups, qbGroup, qbEnabled } = groupsFromRules(settings.scoringRules);
              return <RuleFieldsets groups={groups} qbGroup={qbGroup} qbEnabled={qbEnabled} />;
            })()}
          </ActionForm>
        </div>
      </section>

      <section className="rounded-lg border border-line p-5">
        <h2 className="display text-xl">Roster slots</h2>
        <div className="mt-4">
          <ActionForm action={updateRosterAction} submitLabel="Save roster" successMessage="Saved">
            <input type="hidden" name="slug" value={slug} />
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {ACTIVE_SLOTS.map((slot) => (
                <label key={slot} className="flex flex-col gap-1 text-sm">
                  {slot}
                  <input
                    name={`slot_${slot}`}
                    type="number"
                    min={0}
                    max={20}
                    defaultValue={slotCounts.get(slot) ?? 0}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          </ActionForm>
        </div>
      </section>

      <section className="rounded-lg border border-line p-5">
        <h2 className="display text-xl">Draft, waivers &amp; playoffs</h2>
        <div className="mt-4">
          <ActionForm action={updateConfigsAction} submitLabel="Save configs" successMessage="Saved">
            <input type="hidden" name="slug" value={slug} />
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-sm">
                Seconds per pick
                <input
                  name="secondsPerPick"
                  type="number"
                  min={30}
                  defaultValue={settings.draftConfig.secondsPerPick}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Draft order
                <select name="orderMode" defaultValue={settings.draftConfig.orderMode} className={inputClass}>
                  <option value="random">Random</option>
                  <option value="manual">Manual</option>
                  <option value="reverse_standings">Reverse standings</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Rounds
                <input
                  name="rounds"
                  type="number"
                  min={1}
                  max={40}
                  defaultValue={settings.draftConfig.rounds}
                  className={inputClass}
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-3">
                <input
                  name="thirdRoundReversal"
                  type="checkbox"
                  defaultChecked={settings.draftConfig.thirdRoundReversal}
                />
                Third-round reversal
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Waiver mode
                <select name="waiverMode" defaultValue={settings.waiverConfig.mode} className={inputClass}>
                  <option value="priority">Priority</option>
                  <option value="faab">FAAB</option>
                  <option value="none">None (free agency)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Process day (0=Sun)
                <input
                  name="processDow"
                  type="number"
                  min={0}
                  max={6}
                  defaultValue={settings.waiverConfig.processDow}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Process hour (UTC)
                <input
                  name="processHourUtc"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={settings.waiverConfig.processHourUtc}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                FAAB budget
                <input
                  name="faabBudget"
                  type="number"
                  min={0}
                  defaultValue={settings.waiverConfig.faabBudget}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Playoff teams
                <input
                  name="playoffTeams"
                  type="number"
                  min={2}
                  max={16}
                  defaultValue={settings.playoffConfig.teams}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Playoff start week
                <input
                  name="playoffStartWeek"
                  type="number"
                  min={1}
                  max={18}
                  defaultValue={settings.playoffConfig.startWeek}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                Weeks per round
                <input
                  name="weeksPerRound"
                  type="number"
                  min={1}
                  max={2}
                  defaultValue={settings.playoffConfig.weeksPerRound}
                  className={inputClass}
                />
              </label>
            </div>
          </ActionForm>
        </div>
      </section>
    </div>
  );
}
