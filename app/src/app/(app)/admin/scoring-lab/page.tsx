import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { playerWeekStats } from "@/lib/db/schema";
import { ScoringLab } from "@/components/scoring-lab";
import { LAB_FIELD_GROUPS, QB_FIELD_GROUP } from "@/lib/scoring/lab-form";

export const metadata = { title: "Scoring Lab — FP Fantasy League" };

export default async function ScoringLabPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isSiteAdmin) redirect("/leagues");

  const seasonRows = await db
    .selectDistinct({ season: playerWeekStats.season })
    .from(playerWeekStats)
    .orderBy(sql`season`);
  const seasons = seasonRows.map((r) => r.season);

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
      <div>
        {seasons.length === 0 ? (
          <p className="text-muted">
            No stat data loaded yet — run the scoring pipeline first.
          </p>
        ) : (
          <ScoringLab seasons={seasons} fieldGroups={LAB_FIELD_GROUPS} qbGroup={QB_FIELD_GROUP} />
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
            ["Turnover-worthy throw", "Charter flagged the pass as turnover-worthy, whether or not it was intercepted."],
            ["Hero throw / hero catch", "Charter's wow-throw flag on the QB / highlight-catch flag on the receiver."],
            ["Drop", "Incompletion charted DP — receiver dropped a catchable ball (charged to the receiver)."],
            ["Air yards (pass / rec)", "Charted throw depth — line of scrimmage to the catch point — summed over the QB's attempts / the receiver's targets."],
            ["YAC", "Yards gained after the catch on each reception."],
            ["Missed tackles forced", "Charted MTF on each play, credited to the ball carrier — rushes plus catch-and-run."],
            ["Separation (per route)", "Every route the player runs is graded −2 (pressed) to +4 (coverage bust); the weekly value is the sum across all routes, not just targets."],
            ["Rushing stuff", "A carry stopped for zero or negative yards (QB kneels excluded)."],
            ["YBC / YACO", "Rushing yards before first contact / after first contact, from charting."],
            ["Pass yds·1D·TD (5+ air)", "Same passing stats, but only on throws charted at 5 or more air yards — everything shorter is excluded in QB advanced mode."],
            ["Sacks taken", "Sacks (including half-sacks) on the QB's dropbacks."],
            ["EPA / dropback", "Expected Points Added summed over every dropback (passes, sacks, scrambles), divided by dropbacks — multiplied by your factor (default ×10)."],
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
