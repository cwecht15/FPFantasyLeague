"use client";

/** Shared scoring-rule fieldsets: used by the admin Scoring Lab and the league
 *  settings editor so both present identical input boxes. */

import type { LabFieldGroup, ScopeState } from "@/lib/scoring/lab-form";
import {
  ADVANCED_SCOPE_KEYS,
  ADVANCED_SCOPE_LABELS,
  SCOPE_POSITIONS,
} from "@/lib/scoring/scoring-systems";

const inputClass =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-paper focus:outline-none";

export function RuleFieldsets({ groups, scope }: { groups: LabFieldGroup[]; scope?: ScopeState }) {
  return (
    <>
      {groups.map((group) => (
        <fieldset key={group.title}>
          <legend className="label">{group.title}</legend>
          <div className="mt-2 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {group.fields.map((f) => (
              <label key={f.name} className="flex flex-col gap-1 text-xs text-paper/80">
                {f.label}
                <input
                  name={f.name}
                  type="number"
                  step={f.step ?? "any"}
                  defaultValue={f.default}
                  className={inputClass}
                  title={f.hint}
                />
                {f.hint && <span className="text-[10px] text-faint">{f.hint}</span>}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {scope && <ScopeMatrix scope={scope} />}
    </>
  );
}

/** Position-eligibility matrix: for each scopeable advanced stat, which of
 *  QB/RB/WR/TE earn it. The hidden marker tells `rulesFromForm` the matrix was
 *  rendered, so an all-unchecked row is read as "score for nobody" rather than
 *  falling back to defaults. */
function ScopeMatrix({ scope }: { scope: ScopeState }) {
  return (
    <fieldset>
      <legend className="label">
        Position scope — which slots earn each advanced stat (uncheck to exclude)
      </legend>
      <input type="hidden" name="advScopePresent" value="1" />
      <div className="mt-2 flex flex-col gap-1">
        {ADVANCED_SCOPE_KEYS.map((key) => (
          <div
            key={key}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line py-1.5 text-xs text-paper/80 last:border-b-0"
          >
            <span className="min-w-[160px]">{ADVANCED_SCOPE_LABELS[key]}</span>
            <span className="flex items-center gap-3">
              {SCOPE_POSITIONS.map((p) => (
                <label key={p} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name={`scope_${key}_${p}`}
                    defaultChecked={scope[key].includes(p)}
                    className="accent-flame"
                  />
                  {p}
                </label>
              ))}
            </span>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
