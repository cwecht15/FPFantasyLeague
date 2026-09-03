"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { saveLineupAction, type SlotFormState } from "@/lib/lineups/actions";
import type { RosteredPlayer, SlotView } from "@/lib/lineups/service";
import { fireToast } from "@/components/toast";
import { fmt1, fmtKick } from "@/lib/format";

const initialState: SlotFormState = { error: null };

const POS_ORDER = ["QB", "RB", "WR", "TE", "COACH"];

type Selection = { kind: "slot"; slotId: number } | { kind: "player"; gsisId: string } | null;

/** Game Day lineup editor, click-to-swap: the starters column lists every
 *  lineup slot, the bench column lists every rostered player not starting.
 *  Tap a slot then a player (or a player then a slot) to place them; all
 *  changes stay local until the single SET LINEUP submit. Past weeks render
 *  read-only with points; locked slots/players can't move. */
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

  const starters = useMemo(
    () => slots.filter((s) => s.slot !== "BENCH" && s.slot !== "IR"),
    [slots],
  );
  const benchSlots = useMemo(
    () => slots.filter((s) => s.slot === "BENCH" || s.slot === "IR"),
    [slots],
  );

  const serverAssign = useMemo(() => {
    const m: Record<number, string | null> = {};
    for (const s of starters) m[s.slotId] = s.gsisId;
    return m;
  }, [starters]);

  const [assign, setAssign] = useState<Record<number, string | null>>(serverAssign);
  const [sel, setSel] = useState<Selection>(null);

  // Re-sync local state after a save (revalidatePath refreshes the RSC props).
  const serverKey = JSON.stringify(serverAssign);
  useEffect(() => {
    setAssign(JSON.parse(serverKey));
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  useEffect(() => {
    if (state.notice) fireToast(state.notice);
  }, [state]);

  const byId = useMemo(() => new Map(roster.map((p) => [p.gsisId, p])), [roster]);

  const startingIds = new Set(Object.values(assign).filter((g): g is string => !!g));
  const benchPlayers = roster
    .filter((p) => !startingIds.has(p.gsisId))
    .sort(
      (a, b) =>
        POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position) ||
        a.name.localeCompare(b.name),
    );

  const dirty = starters.some((s) => (assign[s.slotId] ?? null) !== (s.gsisId ?? null));

  const allowedIn = (slot: SlotView): string[] => eligibility[slot.slot] ?? [];
  const canHold = (slot: SlotView, gsisId: string | null): boolean => {
    if (!gsisId) return true;
    const allowed = allowedIn(slot);
    const pos = byId.get(gsisId)?.position;
    return allowed.length === 0 || (!!pos && allowed.includes(pos));
  };

  // Stable bench-slot assignment for submit: benched players keep their
  // server-side bench slot where possible (so locked bench players never
  // "move" and get skipped); newly benched players take the freed slots.
  const benchAssign = useMemo(() => {
    const m = new Map<number, string>();
    const placed = new Set<string>();
    for (const b of benchSlots) {
      if (b.gsisId && !startingIds.has(b.gsisId) && byId.has(b.gsisId)) {
        m.set(b.slotId, b.gsisId);
        placed.add(b.gsisId);
      }
    }
    const waiting = benchPlayers.filter((p) => !placed.has(p.gsisId));
    for (const b of benchSlots) {
      if (m.has(b.slotId)) continue;
      const next = waiting.shift();
      if (!next) break;
      m.set(b.slotId, next.gsisId);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [benchSlots, benchPlayers, byId]);

  const place = (slotId: number, gsisId: string | null) => {
    setAssign((a) => ({ ...a, [slotId]: gsisId }));
    setSel(null);
  };

  const clickSlot = (slot: SlotView) => {
    if (!editable || slot.locked) return;
    if (sel?.kind === "player") {
      const p = byId.get(sel.gsisId);
      if (p && !p.locked && canHold(slot, p.gsisId)) place(slot.slotId, p.gsisId);
      return;
    }
    if (sel?.kind === "slot") {
      if (sel.slotId === slot.slotId) {
        setSel(null);
        return;
      }
      // Slot-to-slot swap (e.g. juggle a FLEX): both slots unlocked, each
      // occupant eligible for the other's slot.
      const other = starters.find((s) => s.slotId === sel.slotId);
      if (other && !other.locked) {
        const a = assign[other.slotId] ?? null;
        const b = assign[slot.slotId] ?? null;
        if ((a || b) && canHold(slot, a) && canHold(other, b)) {
          setAssign((cur) => ({ ...cur, [other.slotId]: b, [slot.slotId]: a }));
          setSel(null);
          return;
        }
      }
      setSel({ kind: "slot", slotId: slot.slotId });
      return;
    }
    setSel({ kind: "slot", slotId: slot.slotId });
  };

  const clickBench = (p: RosteredPlayer) => {
    if (!editable || p.locked) return;
    if (sel?.kind === "slot") {
      const slot = starters.find((s) => s.slotId === sel.slotId);
      if (slot && !slot.locked && canHold(slot, p.gsisId)) place(slot.slotId, p.gsisId);
      return;
    }
    if (sel?.kind === "player" && sel.gsisId === p.gsisId) {
      setSel(null);
      return;
    }
    // No selection: drop into the first eligible empty slot, else select the
    // player and light up where they can go.
    const empty = starters.find(
      (s) => !s.locked && !(assign[s.slotId] ?? null) && canHold(s, p.gsisId),
    );
    if (empty) place(empty.slotId, p.gsisId);
    else setSel({ kind: "player", gsisId: p.gsisId });
  };

  const slotLabel = (slot: SlotView) =>
    `${slot.slot === "BENCH" ? "BN" : slot.slot}${
      slot.slot !== "BENCH" && slot.slot !== "IR" && slot.slotIndex > 0
        ? ` ${slot.slotIndex + 1}`
        : ""
    }`;

  const selPlayer = sel?.kind === "player" ? byId.get(sel.gsisId) : undefined;
  const selSlot = sel?.kind === "slot" ? starters.find((s) => s.slotId === sel.slotId) : undefined;

  const starterTotal = starters.reduce((sum, s) => {
    const g = assign[s.slotId];
    return sum + (g ? (byId.get(g)?.points ?? 0) : 0);
  }, 0);
  const anyScored = starters.some((s) => {
    const g = assign[s.slotId];
    return g ? byId.get(g)?.points != null : false;
  });

  const playerCell = (p: RosteredPlayer | undefined, slot?: SlotView) => {
    if (!p) {
      const allowed = slot ? allowedIn(slot) : [];
      return (
        <span className="text-faint">
          Empty{allowed.length > 1 ? ` — ${allowed.join(" / ")}` : ""}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2">
        <span className={`pos ${p.position}`}>{p.position}</span>
        <span className="font-bold">{p.name}</span>
        {p.nflTeam && <span className="text-[12px] text-faint">{p.nflTeam}</span>}
        {p.locked && <span className="lu-tag">LOCKED</span>}
      </span>
    );
  };

  const starterRow = (slot: SlotView) => {
    const g = assign[slot.slotId] ?? null;
    const p = g ? byId.get(g) : undefined;
    let cls = "";
    if (editable) {
      if (slot.locked) cls = "lu-row lock";
      else if (selSlot?.slotId === slot.slotId) cls = "lu-row sel";
      else if (selPlayer)
        cls = canHold(slot, selPlayer.gsisId) && !selPlayer.locked ? "lu-row elig" : "lu-row mute";
      else cls = "lu-row hov";
    }
    return (
      <tr key={slot.slotId} className={cls} onClick={() => clickSlot(slot)}>
        <td className="num dim" style={{ fontSize: 11.5, width: 64 }}>
          {slotLabel(slot)}
        </td>
        <td>
          {playerCell(p, slot)}
          {slot.locked && editable && !p?.locked && <span className="lu-tag">LOCKED</span>}
        </td>
        <td className="dim" style={{ fontSize: 12, width: 110 }}>
          {p ? fmtKick(p.kickoffAt) : ""}
        </td>
        <td className="r num" style={{ width: 70 }}>
          {p ? (p.points !== null ? fmt1(p.points) : "—") : ""}
        </td>
        <td className="r" style={{ width: 40 }}>
          {editable && p && !slot.locked && !p.locked && (
            <button
              type="button"
              className="btn2"
              style={{ padding: "2px 8px", fontSize: 11 }}
              title="Send to bench"
              onClick={(e) => {
                e.stopPropagation();
                place(slot.slotId, null);
              }}
            >
              ✕
            </button>
          )}
        </td>
      </tr>
    );
  };

  const benchRow = (p: RosteredPlayer) => {
    let cls = "";
    if (editable) {
      if (p.locked) cls = "lu-row lock mute";
      else if (selPlayer?.gsisId === p.gsisId) cls = "lu-row sel";
      else if (selSlot) cls = canHold(selSlot, p.gsisId) ? "lu-row elig" : "lu-row mute";
      else cls = "lu-row hov";
    }
    return (
      <tr key={p.gsisId} className={cls} onClick={() => clickBench(p)}>
        <td>{playerCell(p)}</td>
        <td className="dim" style={{ fontSize: 12, width: 110 }}>
          {fmtKick(p.kickoffAt)}
        </td>
        <td className="r num" style={{ width: 70 }}>
          {p.points !== null ? fmt1(p.points) : "—"}
        </td>
      </tr>
    );
  };

  const hint = !editable
    ? null
    : selSlot
      ? `Pick a player for ${slotLabel(selSlot)}`
      : selPlayer
        ? `Pick a slot for ${selPlayer.name}`
        : "Tap a slot, then a player — or tap a player to auto-place";

  return (
    <form action={formAction}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="week" value={week} />
      {editable &&
        starters.map((s) => (
          <input
            key={s.slotId}
            type="hidden"
            name={`slot_${s.slotId}`}
            value={assign[s.slotId] ?? ""}
          />
        ))}
      {editable &&
        benchSlots.map((s) => (
          <input
            key={s.slotId}
            type="hidden"
            name={`slot_${s.slotId}`}
            value={benchAssign.get(s.slotId) ?? ""}
          />
        ))}

      <div className="mb-3.5 mt-1 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted">
          Starter total:{" "}
          <b className="font-mono text-base text-paper">{anyScored ? fmt1(starterTotal) : "—"}</b>
        </span>
        <div className="flex items-center gap-3">
          {state.error && <span className="text-sm text-flame">{state.error}</span>}
          {editable && dirty && (
            <>
              <span className="text-[12px] text-faint">Unsaved changes</span>
              <button
                type="button"
                className="btn2"
                onClick={() => {
                  setAssign(JSON.parse(serverKey));
                  setSel(null);
                }}
              >
                Reset
              </button>
            </>
          )}
          {editable && (
            <button type="submit" disabled={pending} className="btn pri">
              <span>{pending ? "Saving…" : "Set lineup"}</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="panel min-w-0">
          <div className="ptitle">
            <span className="t">Starters</span>
            {hint && <span className="m">{hint}</span>}
          </div>
          <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Slot</th>
                <th>Player</th>
                <th style={{ width: 110 }}>Kickoff</th>
                <th className="r" style={{ width: 70 }}>
                  Pts
                </th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>{starters.map(starterRow)}</tbody>
          </table>
          </div>
        </div>

        <div className="panel min-w-0">
          <div className="ptitle">
            <span className="t">Bench</span>
            <span className="m">
              {benchPlayers.length} of {roster.length}
            </span>
          </div>
          <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Player</th>
                <th style={{ width: 110 }}>Kickoff</th>
                <th className="r" style={{ width: 70 }}>
                  Pts
                </th>
              </tr>
            </thead>
            <tbody>
              {benchPlayers.length > 0 ? (
                benchPlayers.map(benchRow)
              ) : (
                <tr>
                  <td colSpan={3} className="dim">
                    Everyone is starting.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {roster.length === 0 && (
        <p className="note mt-3">Your roster is empty — add players from the Players tab.</p>
      )}
    </form>
  );
}
