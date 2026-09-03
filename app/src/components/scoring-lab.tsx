"use client";

import { useActionState, useState } from "react";
import { runScoringLab, saveScoringSet, type LabState } from "@/lib/scoring/lab-actions";
import {
  groupsFromRules,
  rulesFromForm,
  type LabFieldGroup,
  type ScopeState,
} from "@/lib/scoring/lab-form";
import {
  SCOPE_POSITIONS,
  SCORING_PRESETS,
  SCORING_PRESET_OPTIONS,
  type ScoringPresetKey,
  type ScoringRules,
} from "@/lib/scoring/scoring-systems";
import { RuleFieldsets } from "@/components/rules-fields";
import { ScoringCardOverlay } from "@/components/scoring-card-overlay";
import { fireToast } from "@/components/toast";

const initialState: LabState = { error: null };

const POSITION_ORDER = ["QB", "RB", "WR", "TE", "COACH"];

/** Full stat line: one column per scoring component present in the result set,
 *  ordered by total magnitude. Horizontally scrollable for wide rule sets.
 *  Position chips filter the returned rows instantly (server keeps the top
 *  `limit` of every position, so each view has full depth). */
function LabLeaderboard({
  rows: allRows,
  scope,
  limit = 100,
}: {
  rows: NonNullable<LabState["rows"]>;
  scope?: string;
  limit?: number;
}) {
  const [posFilter, setPosFilter] = useState("ALL");
  // Column sort: null = server order (total points). Click a numeric header to
  // sort descending, again for ascending, a third time to reset.
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const present = new Set(allRows.map((r) => r.position));
  const positions = POSITION_ORDER.filter((p) => present.has(p));

  const filtered =
    posFilter === "ALL"
      ? allRows.filter((r) => r.rank <= limit)
      : allRows.filter((r) => r.position === posFilter);

  const sortValue = (r: (typeof allRows)[number]): number | undefined => {
    if (!sort) return undefined;
    if (sort.key === "points") return r.points;
    if (sort.key === "ppg") return r.ppg;
    if (sort.key === "games") return r.games;
    return r.components[sort.key];
  };
  const rows = sort
    ? [...filtered].sort((a, b) => {
        const va = sortValue(a);
        const vb = sortValue(b);
        // Rows without the component always sink to the bottom.
        if (va === undefined) return vb === undefined ? 0 : 1;
        if (vb === undefined) return -1;
        return (vb - va) * sort.dir;
      })
    : filtered;

  const cycleSort = (key: string) =>
    setSort((s) =>
      s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null,
    );
  const arrow = (key: string) =>
    sort?.key === key ? (sort.dir === 1 ? " ▼" : " ▲") : "";

  const totals = new Map<string, number>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r.components)) {
      totals.set(k, (totals.get(k) ?? 0) + Math.abs(v));
    }
  }
  const cols = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);

  return (
    <section className="panel">
      <div className="ptitle">
        <span className="t">Leaderboard</span>
        <span className="m">{scope}</span>
      </div>
      {positions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 px-[22px] pt-3">
          {["ALL", ...positions].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosFilter(p)}
              className={`btn2 ${posFilter === p ? "pri" : ""}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-muted">
              <th className="sticky left-0 bg-ink px-2 py-2">#</th>
              <th className="sticky left-8 bg-ink px-2 py-2">Player</th>
              <th className="px-2 py-2">Pos</th>
              <th className="px-2 py-2">Team</th>
              <th
                className="cursor-pointer select-none px-2 py-2 text-right hover:text-paper"
                title="Sort by games"
                onClick={() => cycleSort("games")}
              >
                G{arrow("games")}
              </th>
              <th
                className="cursor-pointer select-none px-2 py-2 text-right hover:text-paper"
                title="Sort by total points"
                onClick={() => cycleSort("points")}
              >
                Points{arrow("points")}
              </th>
              <th
                className="cursor-pointer select-none px-2 py-2 text-right hover:text-paper"
                title="Sort by points per game"
                onClick={() => cycleSort("ppg")}
              >
                PPG{arrow("ppg")}
              </th>
              {cols.map((c) => (
                <th
                  key={c}
                  className="cursor-pointer select-none px-2 py-2 text-right text-xs font-normal text-faint hover:text-paper"
                  title={`Sort by ${c}`}
                  onClick={() => cycleSort(c)}
                >
                  {c}
                  {arrow(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.gsisId} className="border-b border-line hover:bg-pit">
                <td className="sticky left-0 bg-ink px-2 py-1.5 text-faint">
                  {posFilter === "ALL" ? r.rank : r.posRank}
                </td>
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
  scope: initialScope,
  initialSetName = "",
}: {
  seasons: number[];
  fieldGroups: LabFieldGroup[];
  scope: ScopeState;
  initialSetName?: string;
}) {
  const [state, formAction, pending] = useActionState(runScoringLab, initialState);
  const [card, setCard] = useState<{ title: string; season: number; rules: ScoringRules } | null>(
    null,
  );

  // React 19 resets uncontrolled form inputs once a form action completes, which
  // would snap every rule box (and scope checkbox) back to its preset default
  // after "Run scoring". Re-seed the defaults from the rules we just scored so
  // the form keeps showing what the admin actually ran (the reset then lands on
  // these values).
  const derived = state.rulesUsed ? groupsFromRules(state.rulesUsed) : null;
  const groups = derived?.groups ?? fieldGroups;
  const scope = derived?.scope ?? initialScope;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex flex-col gap-4">
        <div className="panel">
          <div className="ptitle">
            <span className="t">Scope</span>
          </div>
          <div className="grid gap-4 px-[22px] py-4 sm:grid-cols-4">
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
              {["ALL", "QB", "RB", "WR", "TE", "COACH"].map((p) => (
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
        </div>

        <div className="panel">
          <div className="ptitle">
            <span className="t">Rules</span>
            <label className="m flex items-center gap-2 normal-case">
              Load preset
              <select
                defaultValue=""
                className={inputClass}
                style={{ padding: "4px 8px", fontSize: 13 }}
                onChange={(e) => {
                  const key = e.currentTarget.value as ScoringPresetKey;
                  const form = e.currentTarget.closest("form");
                  if (!key || !form) return;
                  // Fill every rule input and scope checkbox from the preset —
                  // client-side only, like Zero out all; nothing runs or saves.
                  const { groups: pg, scope: ps } = groupsFromRules(SCORING_PRESETS[key]);
                  for (const g of pg) {
                    for (const f of g.fields) {
                      const input = form.querySelector<HTMLInputElement>(`input[name="${f.name}"]`);
                      if (input) input.value = String(f.default);
                    }
                  }
                  for (const [k, positions] of Object.entries(ps)) {
                    for (const p of SCOPE_POSITIONS) {
                      const cb = form.querySelector<HTMLInputElement>(
                        `input[name="scope_${k}_${p}"]`,
                      );
                      if (cb) cb.checked = positions.includes(p);
                    }
                  }
                  fireToast(
                    `${SCORING_PRESET_OPTIONS.find((o) => o.key === key)?.label ?? key} loaded — run scoring to apply`,
                  );
                  e.currentTarget.value = "";
                }}
              >
                <option value="">Scoring system…</option>
                {SCORING_PRESET_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-col gap-5 px-[22px] py-4">
            <RuleFieldsets groups={groups} scope={scope} />
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={pending} className="btn pri self-start">
                <span>{pending ? "Scoring…" : "Run scoring"}</span>
              </button>
              <button
                type="button"
                className="btn gho self-start"
                title="Set every scoring value to 0 (yards-per-point at 0 = off) and build up from scratch"
                onClick={(e) => {
                  e.currentTarget
                    .closest("form")
                    ?.querySelectorAll<HTMLInputElement>('input[type="number"]')
                    .forEach((input) => {
                      input.value = "0";
                    });
                }}
              >
                <span>Zero out all</span>
              </button>
              <button
                type="button"
                className="btn gho self-start"
                title="Show the current rule set as a shareable card — screenshot, copy as text, or print"
                onClick={(e) => {
                  const form = e.currentTarget.closest("form");
                  if (!form) return;
                  const fd = new FormData(form);
                  setCard({
                    title: String(fd.get("setName") ?? "").trim() || "Scoring Lab",
                    season: Number(fd.get("season")) || 0,
                    rules: rulesFromForm(fd),
                  });
                }}
              >
                <span>Scoring card</span>
              </button>
              <span className="note">Nothing is written — pure what-if on posted stat lines.</span>
              {state.error && <span className="text-sm text-flame">{state.error}</span>}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <input
                  name="setName"
                  defaultValue={initialSetName}
                  placeholder="Set name…"
                  maxLength={60}
                  className="input"
                  style={{ padding: "5px 10px", fontSize: 13, width: 180 }}
                />
                <button type="submit" formAction={saveScoringSet} className="btn gho">
                  <span>Save set</span>
                </button>
              </span>
            </div>
          </div>
        </div>
      </form>

      {state.rows && <LabLeaderboard rows={state.rows} scope={state.scope} limit={state.limit} />}

      {card && (
        <ScoringCardOverlay
          title={card.title}
          meta={`Lab preview · Season ${card.season || "—"}`}
          season={card.season}
          rules={card.rules}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  );
}
