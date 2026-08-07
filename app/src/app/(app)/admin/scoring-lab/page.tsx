import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { playerWeekStats, scoringSets } from "@/lib/db/schema";
import { ScoringLab } from "@/components/scoring-lab";
import { deleteScoringSet } from "@/lib/scoring/lab-actions";
import { defaultScopeState, groupsFromRules, LAB_FIELD_GROUPS } from "@/lib/scoring/lab-form";

export const metadata = { title: "Scoring Lab — FP Fantasy League" };

export default async function ScoringLabPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isSiteAdmin) redirect("/leagues");
  const { set: setParam } = await searchParams;

  const seasonRows = await db
    .selectDistinct({ season: playerWeekStats.season })
    .from(playerWeekStats)
    .orderBy(sql`season`);
  const seasons = seasonRows.map((r) => r.season);

  const sets = await db.select().from(scoringSets).orderBy(desc(scoringSets.updatedAt));
  const selected = setParam ? (sets.find((s) => s.id === Number(setParam)) ?? null) : null;

  const prefill = selected
    ? groupsFromRules(selected.rules)
    : { groups: LAB_FIELD_GROUPS, scope: defaultScopeState() };

  return (
    <div>
      <header className="page-head">
        <div>
          <div className="eyebrow">Admin</div>
          <h1 className="display">Scoring Lab</h1>
          <div className="sub">
            Dial in scoring — including advanced charting stats — and score real past-season
            stat lines to see who finishes where.
          </div>
        </div>
      </header>

      <div className="panel mb-4">
        <div className="ptitle">
          <span className="t">Saved scoring sets</span>
          {selected && <span className="m">loaded: {selected.name}</span>}
        </div>
        {sets.length === 0 ? (
          <p className="empty">
            None yet — tune the rules below, give the set a name, and hit Save set.
          </p>
        ) : (
          <div>
            {sets.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-[22px] py-2.5 text-[13.5px] last:border-b-0"
                style={selected?.id === s.id ? { background: "rgba(204,51,51,0.10)" } : undefined}
              >
                <span>
                  <b>{s.name}</b>
                  {s.rules.xfp && Object.values(s.rules.xfp).some((v) => v !== 0) && (
                    <span className="ml-2 text-[11px] text-faint">xFP</span>
                  )}
                  <span className="ml-3 text-[11.5px] text-faint">
                    saved {s.updatedAt.toLocaleString()}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Link href={`/admin/scoring-lab?set=${s.id}`} className="btn2 pri">
                    Load
                  </Link>
                  <form action={deleteScoringSet}>
                    <input type="hidden" name="setId" value={s.id} />
                    <button type="submit" className="btn2">
                      Delete
                    </button>
                  </form>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        {seasons.length === 0 ? (
          <p className="empty">No stat data loaded yet — run the scoring pipeline first.</p>
        ) : (
          <ScoringLab
            key={selected?.id ?? "default"}
            seasons={seasons}
            fieldGroups={prefill.groups}
            scope={prefill.scope}
            initialSetName={selected?.name ?? ""}
          />
        )}
      </div>

      <details className="mt-10 rounded-lg border border-line p-5">
        <summary className="label cursor-pointer text-sm">
          Stat definitions — what each input scores, from the raw data
        </summary>
        <div className="mt-4 grid gap-x-10 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ["Pass / rush / rec yards & TDs", "Play-by-play aggregation per player-week: passing credited to the passer, receiving to the targeted receiver (a receiving TD is the passing TD on the catch), rushing to the ball carrier. Penalty no-plays excluded."],
            ["Receptions / targets", "Completions caught and passes thrown the player's way, from play-by-play."],
            ["Fumbles lost", "Fumbles by the player recovered by the defense."],
            ["Accurate throw", "Charting accuracy grade is on-target: ACC (accurate), BOD (within the frame), or AWY (placed away from coverage)."],
            ["Catchable throw", "Charter deemed the pass catchable — a looser bar than accurate (bad-placement-but-catchable throws count; uncatchable ones don't)."],
            ["Turnover-worthy throw", "Charter flagged the pass as turnover-worthy, whether or not it was intercepted."],
            ["Hero throw / hero catch", "Charter's wow-throw flag on the QB / highlight-catch flag on the receiver."],
            ["Drop", "Incompletion charted DP — receiver dropped a catchable ball (charged to the receiver)."],
            ["Air yards (pass / rec)", "Charted throw depth — line of scrimmage to the catch point — summed over the QB's attempts / the receiver's targets."],
            ["YAC", "Yards gained after the catch on each reception."],
            ["Missed tackles forced", "Charted MTF on each play, credited to the ball carrier — rushes plus catch-and-run. Scores RBs only. Score the combined value, or rushing and receiving MTF at separate rates (not both)."],
            ["Rec YACO", "Receiving yards after contact — the after-contact share of YAC on each reception."],
            ["Receiving first down", "A reception that converted a first down."],
            ["First-read target", "A target where the charted progression read was the QB's first — i.e. the receiver was the primary read on the play. Credited to the targeted receiver."],
            ["Explosive play", "Combined: a rush or reception of 15+ yards. Or score the splits at their own thresholds — explosive rush (10+ yards) and explosive reception (15+ yards) — leaving the combined value at 0."],
            ["Expected fantasy points (xFP)", "PPR-style expected production from charted opportunities (expected catches, receiving/rushing yards, and TDs), summed per player-week — scored by a per-position multiplier (e.g. TE × 1.25)."],
            ["Separation (per route)", "Every route the player runs is graded −2 (pressed) to +4 (coverage bust); the weekly value is the sum across all routes, not just targets. Scores WRs only."],
            ["Separation grades", "The same per-route grades scored individually — e.g. +5 for every +1 (step) route, −10 for every −2 (pressed) route — instead of the linear per-point sum."],
            ["Rushing stuff", "A carry stopped for zero or negative yards (QB kneels excluded)."],
            ["YBC / YACO", "Rushing yards before first contact / after first contact, from charting."],
            ["Pass yds·1D·TD (5+ air)", "Same passing stats, but only on throws charted at 5 or more air yards — everything shorter is excluded. Add these on top of (or instead of) the basic passing values."],
            ["Sacks taken", "Sacks (including half-sacks) on the QB's dropbacks."],
            ["Incompletion", "An incomplete pass attempt — attempts minus completions, so it counts interceptions, drops, throwaways and spikes. Scores the QB only; set a negative value to push down high-volume but inaccurate passers."],
            ["EPA / dropback", "Expected Points Added summed over every dropback (passes, sacks, scrambles), divided by dropbacks — multiplied by your factor (default ×10)."],
            ["EPA total", "The same weekly EPA sum, unscaled by volume — multiplied by your factor (e.g. ×2.5). The volume-based alternative to EPA/dropback."],
            ["PA / motion dropbacks (COACH)", "Team dropbacks off play-action, and team dropbacks with pre-snap or at-snap motion — from charting, credited to the team's coaching staff."],
            ["4th-down go (COACH)", "Going for it on 4th down: any real pass or run snap on 4th down. Punts and FG attempts don't count (fakes do); kneels are excluded."],
            ["Run on 2nd & 7+ (COACH)", "A designed run called on 2nd down with 7 or more yards to go — scrambles and kneels excluded. Typically scored negative to tax predictable playcalling."],
            ["Deep shot on 2nd & 1-2 (COACH)", "A pass attempt of 15+ charted air yards on 2nd down with 1-2 yards to go — rewards taking a shot when the short-yardage down is in hand."],
            ["Team win / 30+ points (COACH)", "Flat bonuses on the coaching staff when the team wins (ties score zero) and when the offense finishes with 30 or more points."],
            ["Position scope", "Which positions earn each multi-position advanced stat. House defaults: explosives, missed tackles forced and rushing detail score RBs; separation and receiving first downs score WRs; the other receiving stats score every pass-catcher. Uncheck a position to drop that stat from its total. Basic passing accuracy and the 5+ air-yard / EPA / incompletion block always score the QB only."],
          ].map(([term, def]) => (
            <div key={term}>
              <span className="font-bold">{term}</span>
              <span className="text-muted"> — {def}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
