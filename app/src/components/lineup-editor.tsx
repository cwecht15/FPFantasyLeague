"use client";

import { useActionState, useEffect } from "react";
import { saveLineupAction, type SlotFormState } from "@/lib/lineups/actions";
import type { RosteredPlayer, SlotView } from "@/lib/lineups/service";
import { fireToast } from "@/components/toast";
import { fmt1, fmtKick } from "@/lib/format";

const initialState: SlotFormState = { error: null };

/** Game Day lineup editor: one form, panel tables, single SET LINEUP submit.
 *  Past weeks render read-only with points; locked slots show a LOCKED tag. */
export function LineupEditor({
  slots,
  roster,
  eligibility,
  slug,
  week,
  editable,
}: {
  slots: SlotView[];
  roster: RosteredPlayer[];
  eligibility: Record<string, string[]>;
  slug: string;
  week: number;
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveLineupAction, initialState);

  useEffect(() => {
    if (state.notice) fireToast(state.notice);
  }, [state]);

  const starters = slots.filter((s) => s.slot !== "BENCH" && s.slot !== "IR");
  const bench = slots.filter((s) => s.slot === "BENCH" || s.slot === "IR");
  const allScored = starters.some((s) => s.points !== null);
  const starterTotal = starters.reduce((sum, s) => sum + (s.points ?? 0), 0);

  const candidatesFor = (slot: SlotView): RosteredPlayer[] => {
    const allowed = eligibility[slot.slot] ?? [];
    if (slot.slot === "BENCH" || slot.slot === "IR" || allowed.length === 0) return roster;
    return roster.filter((p) => allowed.includes(p.position));
  };

  const playerText = (s: SlotView) =>
    s.playerName ? (
      <span className="font-bold">
        {s.playerName}{" "}
        <span className="font-normal text-faint">
          ({s.position}
          {s.nflTeam ? ` · ${s.nflTeam}` : ""})
        </span>
      </span>
    ) : (
      <span className="text-faint">empty</span>
    );

  const row = (slot: SlotView) => (
    <tr key={slot.slotId}>
      <td className="num dim" style={{ fontSize: 11.5, width: 70 }}>
        {slot.slot === "BENCH" ? "BN" : slot.slot}
        {slot.slot !== "BENCH" && slot.slot !== "IR" && slot.slotIndex > 0
          ? ` ${slot.slotIndex + 1}`
          : ""}
      </td>
      <td>
        {!editable || slot.locked ? (
          <span>
            {playerText(slot)}
            {slot.locked && editable && (
              <span className="dim ml-2 text-[11px]">LOCKED</span>
            )}
          </span>
        ) : (
          <select
            name={`slot_${slot.slotId}`}
            defaultValue={slot.gsisId ?? ""}
            className="input max-w-[320px]"
            style={{ padding: "5px 10px", fontSize: 13.5 }}
          >
            <option value="">— empty —</option>
            {candidatesFor(slot).map((p) => (
              <option key={p.gsisId} value={p.gsisId} disabled={p.locked && p.gsisId !== slot.gsisId}>
                {p.name} ({p.position}
                {p.nflTeam ? ` · ${p.nflTeam}` : ""}){p.locked ? " — locked" : ""}
              </option>
            ))}
          </select>
        )}
      </td>
      <td className="dim" style={{ fontSize: 12, width: 120 }}>
        {slot.gsisId ? `${fmtKick(slot.kickoffAt)}` : ""}
      </td>
      <td className="r num" style={{ width: 80 }}>
        {slot.gsisId ? (slot.points !== null ? fmt1(slot.points) : "—") : ""}
      </td>
    </tr>
  );

  const panel = (rowsToShow: SlotView[], title: string) => (
    <div className="panel">
      <div className="ptitle">
        <span className="t">{title}</span>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 70 }}>Slot</th>
            <th>Player</th>
            <th style={{ width: 120 }}>Kickoff</th>
            <th className="r" style={{ width: 80 }}>
              Pts
            </th>
          </tr>
        </thead>
        <tbody>{rowsToShow.map(row)}</tbody>
      </table>
    </div>
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="week" value={week} />

      <div className="mb-3.5 mt-1 flex items-center justify-between">
        <span className="text-sm text-muted">
          Starter total:{" "}
          <b className="font-mono text-base text-paper">
            {allScored ? fmt1(starterTotal) : "—"}
          </b>
        </span>
        <div className="flex items-center gap-3">
          {state.error && <span className="text-sm text-flame">{state.error}</span>}
          {editable && (
            <button type="submit" disabled={pending} className="btn pri">
              <span>{pending ? "Saving…" : "Set lineup"}</span>
            </button>
          )}
        </div>
      </div>

      {panel(starters, "Starters")}
      <div className="h-3.5" />
      {panel(bench, "Bench / IR")}

      {roster.length === 0 && (
        <p className="note mt-3">Your roster is empty — add players from the Players tab.</p>
      )}
    </form>
  );
}
