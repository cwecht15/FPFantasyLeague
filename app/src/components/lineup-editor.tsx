"use client";

import { useActionState } from "react";
import { saveLineupAction, type SlotFormState } from "@/lib/lineups/actions";
import type { RosteredPlayer, SlotView } from "@/lib/lineups/service";

const initialState: SlotFormState = { error: null };

function fmtKickoff(d: Date | string | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One form for the whole lineup: change any number of slots, hit Save once.
 *  Locked slots render read-only; everything else is a select. */
export function LineupEditor({
  slots,
  roster,
  eligibility,
  slug,
  week,
}: {
  slots: SlotView[];
  roster: RosteredPlayer[];
  /** slot name -> allowed positions ([] = any). */
  eligibility: Record<string, string[]>;
  slug: string;
  week: number;
}) {
  const [state, formAction, pending] = useActionState(saveLineupAction, initialState);

  const starters = slots.filter((s) => s.slot !== "BENCH" && s.slot !== "IR");
  const bench = slots.filter((s) => s.slot === "BENCH" || s.slot === "IR");
  const starterTotal = starters.reduce((sum, s) => sum + (s.points ?? 0), 0);

  const candidatesFor = (slot: SlotView): RosteredPlayer[] => {
    const allowed = eligibility[slot.slot] ?? [];
    if (slot.slot === "BENCH" || slot.slot === "IR" || allowed.length === 0) return roster;
    return roster.filter((p) => allowed.includes(p.position));
  };

  const row = (slot: SlotView) => (
    <tr key={slot.slotId} className="border-b border-line">
      <td className="px-2 py-1.5 font-mono text-xs text-muted">
        {slot.slot}
        {slot.slotIndex > 0 ? ` ${slot.slotIndex + 1}` : ""}
      </td>
      <td className="px-2 py-1.5">
        {slot.locked ? (
          <span>
            {slot.playerName ?? <span className="text-faint">empty</span>}
            <span className="ml-2 text-xs text-faint">🔒 locked</span>
          </span>
        ) : (
          <select
            name={`slot_${slot.slotId}`}
            defaultValue={slot.gsisId ?? ""}
            className="w-full max-w-xs rounded-md border border-line-strong bg-surface px-2 py-1 text-sm"
          >
            <option value="">— empty —</option>
            {candidatesFor(slot).map((p) => (
              <option key={p.gsisId} value={p.gsisId} disabled={p.locked && p.gsisId !== slot.gsisId}>
                {p.name} ({p.position}
                {p.nflTeam ? ` · ${p.nflTeam}` : ""}){p.locked ? " 🔒" : ""}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="px-2 py-1.5 text-xs text-faint">
        {slot.gsisId ? fmtKickoff(slot.kickoffAt) : ""}
      </td>
      <td className="px-2 py-1.5 text-right font-medium">
        {slot.points !== null ? slot.points.toFixed(2) : "—"}
      </td>
    </tr>
  );

  const table = (rows: SlotView[], label: string) => (
    <div>
      <h3 className="label text-sm">{label}</h3>
      <table className="mt-2 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-faint">
            <th className="px-2 py-1.5 w-20">Slot</th>
            <th className="px-2 py-1.5">Player</th>
            <th className="px-2 py-1.5 w-28">Kickoff</th>
            <th className="px-2 py-1.5 w-20 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>{rows.map(row)}</tbody>
      </table>
    </div>
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="week" value={week} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          Starter total:{" "}
          <span className="font-semibold text-paper">{starterTotal.toFixed(2)}</span>
        </span>
        <div className="flex items-center gap-3">
          {state.error && <span className="text-sm text-flame">{state.error}</span>}
          {!state.error && state.notice && (
            <span className="text-sm text-paper/70">{state.notice}</span>
          )}
          <button
            type="submit"
            disabled={pending}
            className="btn-flame rounded-md px-5 py-2 text-sm uppercase tracking-wide disabled:opacity-50"
          >
            {pending ? "Saving…" : "Set lineup"}
          </button>
        </div>
      </div>

      {table(starters, "Starters")}
      {bench.length > 0 && table(bench, "Bench / IR")}
      {roster.length === 0 && (
        <p className="text-sm text-faint">
          Your roster is empty — add players from the Players tab (or draft).
        </p>
      )}
    </form>
  );
}
