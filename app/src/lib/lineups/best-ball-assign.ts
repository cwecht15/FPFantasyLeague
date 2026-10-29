/** Pure best-ball lineup assignment (no DB) — see best-ball.ts. */

import { SLOT_ELIGIBILITY, type RosterSlot, type RosterTemplate } from "../leagues/settings";

function eligible(template: RosterTemplate, slot: string): string[] {
  const def = template.slots.find((d) => d.slot === slot);
  if (def?.eligible?.length) return def.eligible;
  return SLOT_ELIGIBILITY[slot as RosterSlot] ?? [];
}

export interface BestBallPlayer {
  gsisId: string;
  position: string;
  points: number;
}

/** Pure assignment: fills starter slots most-restrictive first, each with the
 *  best remaining eligible player, then BENCH/IR with the rest by points.
 *  Exact for nested eligibility (single-position slots + FLEX ⊂ SUPERFLEX),
 *  which every supported template is. Returns slotKey ("SLOT#idx") → gsisId. */
export function bestBallAssignment(
  template: RosterTemplate,
  roster: BestBallPlayer[],
): Map<string, string> {
  const pool = [...roster].sort((a, b) => b.points - a.points);
  const used = new Set<string>();
  const out = new Map<string, string>();

  const starters: { key: string; elig: string[] }[] = [];
  const reserves: string[] = [];
  for (const def of template.slots) {
    for (let i = 0; i < def.count; i++) {
      const key = `${def.slot}#${i}`;
      if (def.slot === "BENCH" || def.slot === "IR") reserves.push(key);
      else starters.push({ key, elig: eligible(template, def.slot) });
    }
  }
  starters.sort((a, b) => (a.elig.length || 99) - (b.elig.length || 99));

  for (const s of starters) {
    const pick = pool.find(
      (p) => !used.has(p.gsisId) && (s.elig.length === 0 || s.elig.includes(p.position)),
    );
    if (pick) {
      used.add(pick.gsisId);
      out.set(s.key, pick.gsisId);
    }
  }
  for (const key of reserves) {
    const next = pool.find((p) => !used.has(p.gsisId));
    if (!next) break;
    used.add(next.gsisId);
    out.set(key, next.gsisId);
  }
  return out;
}
