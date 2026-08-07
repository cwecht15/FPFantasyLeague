/**
 * Scoring-card display model: a ScoringRules object flattened into grouped,
 * human-readable rows for the shareable /leagues/[slug]/scoring-card view and
 * its copy-as-text export. Base components always render ("off" when 0);
 * advanced/coach/xFP components render only when they actually score, each
 * tagged with the positions that earn it (the resolved scope matrix).
 */

import { scopeFromRules, type ScopeState } from "@/lib/scoring/lab-form";
import {
  SCORING_PRESET_OPTIONS,
  type ScopePosition,
  type ScoringRules,
} from "@/lib/scoring/scoring-systems";

export interface CardRow {
  label: string;
  value: string;
  /** Positions that earn this component; omitted = follows the section. */
  positions?: ScopePosition[];
}

export interface CardSection {
  title: string;
  /** Positions the whole section applies to (shown next to the title). */
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

export function presetLabel(rules: ScoringRules): string {
  const opt = SCORING_PRESET_OPTIONS.find((o) => o.key === rules.preset);
  return opt?.label ?? "Custom";
}

export function scoringCardSections(rules: ScoringRules): CardSection[] {
  const a = rules.advanced;
  const scope = scopeFromRules(rules);
  const sections: CardSection[] = [];

  // Optional row: include only when the component is on. A scoped stat whose
  // position list is empty scores nobody — treat it as off.
  const on = (
    label: string,
    value: number | undefined,
    fmt: (v: number) => string = pts,
    positions?: ScopePosition[],
  ): CardRow[] =>
    value && !(positions && positions.length === 0)
      ? [{ label, value: fmt(value), positions }]
      : [];

  // Only components that actually contribute points appear on the card —
  // zeroed base stats (e.g. fp_advanced's passing yards/TD) are simply absent.
  sections.push({
    title: "Passing",
    positions: "QB",
    rows: [
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
    ],
  });

  sections.push({
    title: "Rushing",
    rows: [
      ...on("Rushing yards", rules.rushYdsPerPoint, ydsPer),
      ...on("Rushing TD", rules.rushTd),
      ...on("2-pt rush", rules.rush2pt),
      ...on("Rushing MTF", a?.rushMtf, pts, scope.mtf),
      ...on("Rushing stuff", a?.rushStuff, pts, scope.rushDetail),
      ...on("Yards before contact", a?.ybcYd, perYd, scope.rushDetail),
      ...on("Yards after contact", a?.yacoYd, perYd, scope.rushDetail),
    ],
  });

  const te = rules.tePremiumReception;
  sections.push({
    title: "Receiving",
    rows: [
      ...on("Reception", rules.reception),
      ...(te !== undefined && te !== rules.reception
        ? [{ label: "TE reception (premium)", value: pts(te) }]
        : []),
      ...on("Receiving yards", rules.recYdsPerPoint, ydsPer),
      ...on("Receiving TD", rules.recTd),
      ...on("2-pt catch", rules.rec2pt),
      ...on("Receiving 1st down", a?.recFirstDown, pts, scope.recFirstDown),
      ...on("First-read target", a?.recFirstRead, pts, scope.recFirstRead),
      ...on("Rec air yards", a?.recAirYd, perYd, scope.recAirYd),
      ...on("Yards after catch", a?.recYacYd, perYd, scope.recYac),
      ...on("Rec yards after contact", a?.recYacoYd, perYd, scope.recYaco),
      ...on("Receiving MTF", a?.recMtf, pts, scope.mtf),
      ...on("Hero catch", a?.heroCatch, pts, scope.heroCatch),
      ...on("Drop", a?.drop, pts, scope.drop),
    ],
  });

  const sepRows: CardRow[] = [
    ...on("Separation (per route pt)", a?.sepPoint, pts, scope.separation),
    ...on("−2 pressed at line", a?.sepM2, pts, scope.separation),
    ...on("−1 tight", a?.sepM1, pts, scope.separation),
    ...on("+1 step", a?.sepP1, pts, scope.separation),
    ...on("+2 open", a?.sepP2, pts, scope.separation),
    ...on("+3 wide open", a?.sepP3, pts, scope.separation),
    ...on("+4 coverage bust", a?.sepP4, pts, scope.separation),
  ];
  if (sepRows.length) {
    sections.push({
      title: "Separation",
      positions: scope.separation.join(" · "),
      rows: sepRows.map((r) => ({ ...r, positions: undefined })),
    });
  }

  const miscRows: CardRow[] = [
    ...on("Fumble lost", rules.fumbleLost),
    ...on("Missed tackle forced", a?.missedTackleForced, pts, scope.mtf),
    ...on("Explosive play (15+ yds)", a?.explosivePlay, pts, scope.explosivePlay),
    ...rules.bonuses.map((b) => ({
      label: `${b.threshold}+ ${
        b.stat === "pass_yds" ? "pass" : b.stat === "rush_yds" ? "rush" : "rec"
      } yds (week)`,
      value: pts(b.points),
    })),
  ];
  const x = rules.xfp;
  if (x) {
    for (const [pos, key] of [["QB", "qb"], ["RB", "rb"], ["WR", "wr"], ["TE", "te"]] as const) {
      if (x[key]) {
        miscRows.push({
          label: "Expected fantasy points",
          value: times(x[key]),
          positions: [pos],
        });
      }
    }
  }
  if (miscRows.length) sections.push({ title: "Big plays & misc", rows: miscRows });

  const c = rules.coaching;
  if (c) {
    const coachRows: CardRow[] = [
      ...on("Play-action dropback", c.paDropback),
      ...on("Dropback w/ motion", c.motionDropback),
      ...on("4th-down go", c.fourthDownGo),
      ...on("Team win", c.win),
      ...on("30+ points scored", c.score30Bonus),
    ];
    if (coachRows.length) {
      sections.push({ title: "Coaching staff", positions: "COACH", rows: coachRows });
    }
  }

  // A fully zeroed category vanishes rather than rendering an empty panel.
  return sections.filter((s) => s.rows.length > 0);
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
    lines.push("", s.positions ? `${s.title.toUpperCase()} — ${s.positions}` : s.title.toUpperCase());
    for (const r of s.rows) {
      const tag = r.positions?.length ? `  (${r.positions.join("/")})` : "";
      lines.push(`  ${(r.label + tag).padEnd(38)} ${r.value}`);
    }
  }
  lines.push("", "Results post Tuesday 6:00 AM ET · final Thursday noon");
  return lines.join("\n");
}
