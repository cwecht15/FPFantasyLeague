"use client";

import { useActionState } from "react";
import { runScoringLab, type LabState } from "@/lib/scoring/lab-actions";
import type { LabFieldGroup } from "@/lib/scoring/lab-form";
import { RuleFieldsets } from "@/components/rules-fields";

const initialState: LabState = { error: null };

/** Full stat line: one column per scoring component present in the result set,
 *  ordered by total magnitude. Horizontally scrollable for wide rule sets. */
function LabLeaderboard({ rows, scope }: { rows: NonNullable<LabState["rows"]>; scope?: string }) {
  const totals = new Map<string, number>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.components)) {
      totals.set(k, (totals.get(k) ?? 0) + Math.abs(v));
    }
  }
  const cols = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  return (
    <section>
      <h2 className="display text-xl">Leaderboard</h2>
      <p className="mt-1 text-sm text-muted">{scope}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-muted">
              <th className="sticky left-0 bg-ink px-2 py-2">#</th>
              <th className="sticky left-8 bg-ink px-2 py-2">Player</th>
              <th className="px-2 py-2">Pos</th>
              <th className="px-2 py-2">Team</th>
              <th className="px-2 py-2 text-right">G</th>
              <th className="px-2 py-2 text-right">Points</th>
              <th className="px-2 py-2 text-right">PPG</th>
              {cols.map((c) => (
                <th key={c} className="px-2 py-2 text-right text-xs font-normal text-faint">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.gsisId} className="border-b border-line hover:bg-pit">
                <td className="sticky left-0 bg-ink px-2 py-1.5 text-faint">{r.rank}</td>
                <td className="sticky left-8 bg-ink px-2 py-1.5 font-bold">{r.name}</td>
                <td className="px-2 py-1.5">{r.position}</td>
                <td className="px-2 py-1.5 text-muted">{r.team}</td>
                <td className="px-2 py-1.5 text-right">{r.games}</td>
                <td className="px-2 py-1.5 text-right font-bold">{r.points.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-right text-muted">{r.ppg.toFixed(2)}</td>
                {cols.map((c) => {
                  const v = r.components[c];
                  return (
                    <td
                      key={c}
                      className={`px-2 py-1.5 text-right font-mono text-xs ${
                        v === undefined ? "text-faint/40" : v < 0 ? "text-flame" : "text-paper/80"
                      }`}
                    >
                      {v === undefined ? "—" : v.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const inputClass =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-paper focus:outline-none";

export function ScoringLab({
  seasons,
  fieldGroups,
  qbGroup,
}: {
  seasons: number[];
  fieldGroups: LabFieldGroup[];
  qbGroup: LabFieldGroup;
}) {
  const [state, formAction, pending] = useActionState(runScoringLab, initialState);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-5 rounded-lg border border-line p-5">
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            Season
            <select name="season" defaultValue={seasons[seasons.length - 1]} className={inputClass}>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Week
            <select name="week" defaultValue="0" className={inputClass}>
              <option value="0">Full season</option>
              {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={w}>
                  Week {w}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Position
            <select name="position" defaultValue="ALL" className={inputClass}>
              {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Show top
            <select name="limit" defaultValue="100" className={inputClass}>
              {[50, 100, 200, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <RuleFieldsets groups={fieldGroups} qbGroup={qbGroup} />

        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md btn-flame px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending ? "Scoring…" : "Run scoring"}
        </button>
        {state.error && <p className="text-sm text-flame">{state.error}</p>}
      </form>

      {state.rows && <LabLeaderboard rows={state.rows} scope={state.scope} />}
    </div>
  );
}
