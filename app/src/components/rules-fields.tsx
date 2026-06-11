"use client";

/** Shared scoring-rule fieldsets: used by the admin Scoring Lab and the league
 *  settings editor so both present identical input boxes. */

import type { LabFieldGroup } from "@/lib/scoring/lab-form";

const inputClass =
  "rounded-md border border-line-strong bg-surface px-3 py-2 text-sm focus:border-paper focus:outline-none";

export function RuleFieldsets({
  groups,
  qbGroup,
  qbEnabled = true,
}: {
  groups: LabFieldGroup[];
  qbGroup: LabFieldGroup;
  qbEnabled?: boolean;
}) {
  return (
    <>
      {groups.map((group) => (
        <fieldset key={group.title}>
          <legend className="label">{group.title}</legend>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

      <fieldset className="rounded-md border border-flame/40 p-4">
        <legend className="label px-1 text-flame">{qbGroup.title}</legend>
        <label className="flex items-center gap-2 text-sm font-bold">
          <input type="checkbox" name="qbAdvancedEnabled" defaultChecked={qbEnabled} />
          Enable QB advanced mode
        </label>
        <p className="mt-1 text-xs text-faint">
          When on, QBs ignore the Passing/Rushing values above entirely — only the inputs
          below score them (plus fumbles lost). All passing production on throws under 5
          air yards is excluded.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {qbGroup.fields.map((f) => (
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
    </>
  );
}
