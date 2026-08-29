/**
 * Scoring-card display model: a ScoringRules object flattened into one section
 * per roster position (QB / RB / WR / TE / COACH) for the shareable
 * /leagues/[slug]/scoring-card view, the league-settings summary, and the
 * copy-as-text export. Each section lists every component that position
 * earns, sub-grouped (Passing / Rushing / Receiving / Separation / Misc);
 * only components that actually score are rendered — zeroed rules are absent,
 * and scoped advanced stats appear only under the positions the league's
 * scope matrix grants them (`AdvancedRules.scope`, see scopeFromRules).
 *
 * Mirrors score-stat-line.ts: base stats score whoever records them, the
 * advanced passing/EPA block is QB-only (PASSING_POSITIONS), the TE premium
 * replaces the reception value for tight ends, xFP is a per-position
 * multiplier, and coaching rules only ever apply to COACH rows.
 */

import { scopeFromRules } from "@/lib/scoring/lab-form";
import {
  SCORING_PRESET_OPTIONS,
  type AdvancedScopeKey,
  type ScopePosition,
  type ScoringRules,
} from "@/lib/scoring/scoring-systems";

export type CardPosition = ScopePosition | "COACH";

export interface CardRow {
  label: string;
  value: string;
  /** Sub-heading within a position section (Passing / Rushing / …). */
  group?: string;
  /** Legacy per-row position tags; unused by the by-position layout. */
  positions?: ScopePosition[];
}

export interface CardSection {
  title: string;
  /** The position this section applies to (rendered as a chip next to the title). */
  positions?: string;
  rows: CardRow[];
}

/** Trim float noise: 0.30000000000000004 → "0.3". */
const n = (v: number): string => String(Number(v.toFixed(4)));

/** Signed point value: 4 → "+4", -2 → "-2". */
const pts = (v: number): string => (v > 0 ? `+${n(v)}` : n(v));

const perYd = (v: number): string => `${pts(v)} / yd`;
const times = (v: number): string => `× ${n(v)}`;
const ydsPer = (v: number): string => `1 pt / ${n(v)} yds`;

const POSITION_TITLES: Record<CardPosition, string> = {
  QB: "Quarterback",
  RB: "Running back",
  WR: "Wide receiver",
  TE: "Tight end",
  COACH: "Coaching staff",
};

export function presetLabel(rules: ScoringRules): string {
  const opt = SCORING_PRESET_OPTIONS.find((o) => o.key === rules.preset);
  return opt?.label ?? "Custom";
}

export function scoringCardSections(rules: ScoringRules): CardSection[] {
  const a = rules.advanced;
  const scope = scopeFromRules(rules);

  // Optional row: include only when the component is on.
  const on = (label: string, value: number | undefined, fmt: (v: number) => string = pts): CardRow[] =>
    value ? [{ label, value: fmt(value) }] : [];

  // Scoped advanced family: rows only for positions the scope matrix grants.
  const sc = (key: AdvancedScopeKey, pos: ScopePosition, rows: CardRow[]): CardRow[] =>
    scope[key].includes(pos) ? rows : [];

  const grp = (group: string, rows: CardRow[]): CardRow[] => rows.map((r) => ({ ...r, group }));

  const passing: CardRow[] = [
    ...on("Passing yards", rules.passYdsPerPoint, ydsPer),
    ...on("Passing TD", rules.passTd),
    ...on("Interception", rules.interception),
    ...on("2-pt pass", rules.pass2pt),
    ...on("Pass yds 5+ air", a?.deepPassYd, perYd),
    ...on("Passing 1st down (5+ air)", a?.deepPassFirstDown),
    ...on("Passing TD (5+ air)", a?.deepPassTd),
    ...on("Accurate throw", a?.accurateThrow),
    ...on("Catchable throw", a?.catchableThrow),
    ...on("Turnover-worthy throw", a?.turnoverWorthyThrow),
    ...on("Hero throw", a?.heroThrow),
    ...on("Pass air yards", a?.passAirYd, perYd),
    ...on("Sack taken", a?.sackTaken),
    ...on("Incompletion", a?.incompletion),
    ...on("EPA / dropback", a?.epaPerDropback, times),
    ...on("EPA total", a?.epaTotal, times),
  ];

  const rushing = (pos: ScopePosition): CardRow[] => [
    ...on("Rushing yards", rules.rushYdsPerPoint, ydsPer),
    ...on("Rushing TD", rules.rushTd),
    ...on("2-pt rush", rules.rush2pt),
    ...sc("explosivePlay", pos, on("Explosive rush (10+ yds)", a?.rushExplosive)),
    ...sc("mtf", pos, on("Rushing MTF", a?.rushMtf)),
    ...sc("rushDetail", pos, [
      ...on("Rushing stuff", a?.rushStuff),
      ...on("Yards before contact", a?.ybcYd, perYd),
      ...on("Yards after contact", a?.yacoYd, perYd),
    ]),
  ];

  const receiving = (pos: ScopePosition): CardRow[] => {
    const te = rules.tePremiumReception;
    const premium = pos === "TE" && te !== undefined && te !== rules.reception;
    return [
      ...on(premium ? "Reception (TE premium)" : "Reception", premium ? te : rules.reception),
      ...on("Receiving yards", rules.recYdsPerPoint, ydsPer),
      ...on("Receiving TD", rules.recTd),
      ...on("2-pt catch", rules.rec2pt),
      ...sc("recFirstDown", pos, on("Receiving 1st down", a?.recFirstDown)),
      ...sc("recFirstRead", pos, on("First-read target", a?.recFirstRead)),
      ...sc("recAirYd", pos, on("Rec air yards", a?.recAirYd, perYd)),
      ...sc("recYac", pos, on("Yards after catch", a?.recYacYd, perYd)),
      ...sc("recYaco", pos, on("Rec yards after contact", a?.recYacoYd, perYd)),
      ...sc("explosivePlay", pos, on("Explosive reception (15+ yds)", a?.recExplosive)),
      ...sc("mtf", pos, on("Receiving MTF", a?.recMtf)),
      ...sc("heroCatch", pos, on("Hero catch", a?.heroCatch)),
      ...sc("drop", pos, on("Drop", a?.drop)),
    ];
  };

  const separation = (pos: ScopePosition): CardRow[] =>
    sc("separation", pos, [
      ...on("Separation (per route pt)", a?.sepPoint),
      ...on("−2 pressed at line", a?.sepM2),
      ...on("−1 tight", a?.sepM1),
      ...on("+1 step", a?.sepP1),
      ...on("+2 open", a?.sepP2),
      ...on("+3 wide open", a?.sepP3),
      ...on("+4 coverage bust", a?.sepP4),
    ]);

  // Weekly yardage bonuses, shown under the positions that plausibly hit them.
  const BONUS_STATS: Record<ScopePosition, Set<string>> = {
    QB: new Set(["pass_yds", "rush_yds"]),
    RB: new Set(["rush_yds", "rec_yds"]),
    WR: new Set(["rec_yds", "rush_yds"]),
    TE: new Set(["rec_yds", "rush_yds"]),
  };
  const XFP_KEY = { QB: "qb", RB: "rb", WR: "wr", TE: "te" } as const;

  const misc = (pos: ScopePosition): CardRow[] => [
    ...on("Fumble lost", rules.fumbleLost),
    ...sc("mtf", pos, on("Missed tackle forced", a?.missedTackleForced)),
    ...sc("explosivePlay", pos, on("Explosive play (15+ yds)", a?.explosivePlay)),
    ...rules.bonuses
      .filter((b) => BONUS_STATS[pos].has(b.stat))
      .map((b) => ({
        label: `${b.threshold}+ ${
          b.stat === "pass_yds" ? "pass" : b.stat === "rush_yds" ? "rush" : "rec"
        } yds (week)`,
        value: pts(b.points),
      })),
    ...on("Expected fantasy points", rules.xfp?.[XFP_KEY[pos]], times),
  ];

  const section = (pos: CardPosition, rows: CardRow[]): CardSection => ({
    title: POSITION_TITLES[pos],
    positions: pos,
    rows,
  });

  const sections: CardSection[] = [
    section("QB", [
      ...grp("Passing", passing),
      ...grp("Rushing", rushing("QB")),
      ...grp("Separation", separation("QB")),
      ...grp("Misc", misc("QB")),
    ]),
    section("RB", [
      ...grp("Rushing", rushing("RB")),
      ...grp("Receiving", receiving("RB")),
      ...grp("Separation", separation("RB")),
      ...grp("Misc", misc("RB")),
    ]),
    section("WR", [
      ...grp("Receiving", receiving("WR")),
      ...grp("Rushing", rushing("WR")),
      ...grp("Separation", separation("WR")),
      ...grp("Misc", misc("WR")),
    ]),
    section("TE", [
      ...grp("Receiving", receiving("TE")),
      ...grp("Rushing", rushing("TE")),
      ...grp("Separation", separation("TE")),
      ...grp("Misc", misc("TE")),
    ]),
  ];

  const c = rules.coaching;
  if (c) {
    sections.push(
      section("COACH", [
        ...on("Play-action dropback", c.paDropback),
        ...on("Dropback w/ motion", c.motionDropback),
        ...on("4th-down go", c.fourthDownGo),
        ...on("Run on 2nd & 7+", c.run2ndLong),
        ...on("Deep shot on 2nd & 1-2", c.deepAtt2ndShort),
        ...on("Team win", c.win),
        ...on("30+ points scored", c.score30Bonus),
      ]),
    );
  }

  // A position with nothing that scores vanishes rather than rendering empty.
  return sections.filter((s) => s.rows.length > 0);
}

/** Distinct sub-group names in order of first appearance (empty if ungrouped). */
export function cardGroups(rows: CardRow[]): string[] {
  const seen: string[] = [];
  for (const r of rows) if (r.group && !seen.includes(r.group)) seen.push(r.group);
  return seen;
}

/** Plain-text rendition for copy/paste into a group chat. */
export function scoringCardText(
  leagueName: string,
  season: number,
  rules: ScoringRules,
): string {
  const lines: string[] = [
    `${leagueName.toUpperCase()} — SCORING (${presetLabel(rules)}, ${season})`,
  ];
  for (const s of scoringCardSections(rules)) {
    lines.push("", s.positions ? `${s.positions} — ${s.title.toUpperCase()}` : s.title.toUpperCase());
    const grouped = cardGroups(s.rows).length > 1;
    let current: string | undefined;
    for (const r of s.rows) {
      if (grouped && r.group !== current) {
        current = r.group;
        lines.push(`  ${current}`);
      }
      lines.push(`  ${(grouped ? "  " : "") + r.label.padEnd(grouped ? 36 : 38)} ${r.value}`);
    }
  }
  lines.push("", "Results post Tuesday 6:00 AM ET · final Thursday noon");
  return lines.join("\n");
}
