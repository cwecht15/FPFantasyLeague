/**
 * Scoring rule presets and types.
 *
 * Ported and generalized from Data_Suite_2.0/app/src/lib/scoring-systems.ts.
 * That file scored OFFENSE only; here we extend the same linear-combination
 * shape with two-point splits, kicking (distance buckets), team defense (DST),
 * and optional IDP, so a single `ScoringRules` object can score every roster
 * slot. The offensive coefficients (passYdsPerPoint=25, passTd=4, INT=-1, …)
 * are unchanged so a QB's points match the FantasyPoints.com validation source.
 */

export type ScoringPresetKey =
  | "ppr"
  | "standard"
  | "half_ppr"
  | "te_premium"
  | "draftkings"
  | "fanduel"
  | "fp_advanced";

/** Per-game yardage bonus (e.g. DraftKings +3 at 100 rec yds). Applied on the
 *  player's WEEKLY total, which is why scoring runs per player-week. */
export interface YardageBonus {
  stat: "pass_yds" | "rush_yds" | "rec_yds";
  threshold: number;
  points: number;
}

export interface KickingRules {
  fg0_39: number;
  fg40_49: number;
  fg50plus: number;
  xp: number;
  fgMiss: number;
}

/** Points-allowed brackets are evaluated low→high: the first bracket whose
 *  `max` is >= the team's points allowed wins. */
export interface DstRules {
  sack: number;
  int: number;
  fumRec: number;
  td: number;
  safety: number;
  blockedKick: number;
  paBrackets: { max: number; points: number }[];
}

export interface IdpRules {
  soloTackle: number;
  assist: number;
  sack: number;
  tfl: number;
  passDef: number;
  int: number;
  fumRec: number;
  forcedFumble: number;
  td: number;
}

/** Advanced charting-stat scoring. Per-event (or per-yard for *AirYds/Yac)
 *  point values; 0 disables a component. Sourced from FantasyPoints charting:
 *  accuracy, turnover-worthy throws, hero throws/catches, drops, air yards,
 *  YAC, and missed tackles forced. Newer fields are optional so rule sets
 *  saved before they existed still validate — absent means 0. */
export interface AdvancedRules {
  accurateThrow: number; // per on-target throw (acc in ACC/BOD/AWY)
  catchableThrow?: number; // per throw charted catchable
  turnoverWorthyThrow: number; // typically negative
  heroThrow: number; // charted wow/hero throw
  heroCatch: number; // charted highlight catch
  drop: number; // typically negative
  missedTackleForced: number; // combined rush + rec MTF — use the splits below OR this, not both
  rushMtf?: number; // per MTF as a rusher (splits double-count if combined is also set)
  recMtf?: number; // per MTF on catch-and-run
  passAirYd: number; // per completed-attempt air yard thrown
  recAirYd: number; // per targeted air yard
  recYacYd: number; // per yard after catch
  recYacoYd?: number; // per receiving yard after contact
  recFirstDown?: number; // per receiving first down
  explosivePlay?: number; // per 15+ yard rush or reception
  sepPoint: number; // per separation point accumulated across routes (-2..+4 each)
  sepM2?: number; // per route graded -2 (pressed at line) — typically negative
  sepM1?: number; // per route graded -1 (tight) — typically negative
  sepP1?: number; // per route graded +1 (step)
  sepP2?: number; // per route graded +2 (open)
  sepP3?: number; // per route graded +3 (wide open)
  sepP4?: number; // per route graded +4 (coverage bust)
  rushStuff: number; // per carry stopped at/behind the LOS — typically negative
  ybcYd: number; // per rushing yard before contact
  yacoYd: number; // per rushing yard after contact
  recFirstRead?: number; // per target where the receiver was the QB's first read
  // ---- passing production from charting/EPA (formerly the standalone "QB
  //      advanced mode"; now plain additive components scored for any passer) ----
  deepPassYd?: number; // per passing yard on throws of 5+ air yards
  deepPassFirstDown?: number; // per passing first down on 5+ air-yard throws
  deepPassTd?: number; // per passing TD on 5+ air-yard throws
  sackTaken?: number; // per sack taken — typically negative
  epaPerDropback?: number; // points per unit of (weekly EPA / dropbacks) — e.g. ×10
  epaTotal?: number; // points per unit of TOTAL weekly EPA — e.g. ×2.5
  incompletion?: number; // per incomplete pass attempt (att − completions) — typically negative
  /** Per-family position eligibility for the configurable advanced stats
   *  (ADVANCED_SCOPE_KEYS). Absent keys fall back to ADVANCED_SCOPE_DEFAULTS. */
  scope?: AdvancedScope;
}

/** Expected-fantasy-points scoring: multiply a player's stored weekly xFP
 *  (PPR-style expected production) by a per-position factor. 0 = off for that
 *  position. Lets TEs be scored e.g. xFP × 1.25 while other slots differ. */
export interface XfpRules {
  qb: number;
  rb: number;
  wr: number;
  te: number;
}

export const DEFAULT_XFP: XfpRules = { qb: 0, rb: 0, wr: 0, te: 0 };

/** The four scoreable offensive positions an advanced stat can be scoped to. */
export type ScopePosition = "QB" | "RB" | "WR" | "TE";
export const SCOPE_POSITIONS: ScopePosition[] = ["QB", "RB", "WR", "TE"];

/** Advanced charting components whose underlying stat legitimately shows up for
 *  more than one position, so *which* positions earn them is admin-configurable
 *  (the Lab / settings scope matrix → `AdvancedRules.scope`). Each key here
 *  bundles a family of rule fields that share one eligibility list:
 *    mtf         → missedTackleForced + rushMtf + recMtf
 *    separation  → sepPoint + sepM2..sepP4
 *    rushDetail  → rushStuff + ybcYd + yacoYd
 *  Everything else (basic passing-accuracy flags, the 5+ air-yard/EPA passing
 *  block) is QB-only by the data and stays fixed (see PASSING_POSITIONS). */
export type AdvancedScopeKey =
  | "explosivePlay"
  | "recFirstDown"
  | "recFirstRead"
  | "heroCatch"
  | "drop"
  | "recAirYd"
  | "recYac"
  | "recYaco"
  | "mtf"
  | "separation"
  | "rushDetail";

export const ADVANCED_SCOPE_KEYS: AdvancedScopeKey[] = [
  "explosivePlay",
  "recFirstDown",
  "recFirstRead",
  "heroCatch",
  "drop",
  "recAirYd",
  "recYac",
  "recYaco",
  "mtf",
  "separation",
  "rushDetail",
];

/** House defaults, used whenever a rule set has no explicit scope for a key
 *  (older saved sets, presets). RBs get explosives + rushing detail + MTF; WRs
 *  get separation + receiving first downs; the rest of the receiving stats go
 *  to every pass-catcher. */
export const ADVANCED_SCOPE_DEFAULTS: Record<AdvancedScopeKey, ScopePosition[]> = {
  explosivePlay: ["RB"],
  recFirstDown: ["WR"],
  recFirstRead: ["WR", "TE", "RB"],
  heroCatch: ["WR", "TE", "RB"],
  drop: ["WR", "TE", "RB"],
  recAirYd: ["WR", "TE", "RB"],
  recYac: ["WR", "TE", "RB"],
  recYaco: ["WR", "TE", "RB"],
  mtf: ["RB"],
  separation: ["WR"],
  rushDetail: ["RB"],
};

/** Labels for the scope-matrix UI. */
export const ADVANCED_SCOPE_LABELS: Record<AdvancedScopeKey, string> = {
  explosivePlay: "Explosive play (15+ yd)",
  recFirstDown: "Receiving 1st down",
  recFirstRead: "First-read target",
  heroCatch: "Hero catch",
  drop: "Drop",
  recAirYd: "Rec air yards",
  recYac: "YAC",
  recYaco: "Rec YACO",
  mtf: "Missed tackles forced",
  separation: "Separation (per-route + grades)",
  rushDetail: "Rushing detail (stuff / YBC / YACO)",
};

/** Does `pos` earn the given scopeable family under these rules? Falls back to
 *  the house default scope when the rule set doesn't pin the key explicitly. */
export function scopeHasPosition(
  scope: AdvancedScope | undefined,
  key: AdvancedScopeKey,
  pos: string,
): boolean {
  const positions = scope?.[key] ?? ADVANCED_SCOPE_DEFAULTS[key];
  return positions.includes(pos as ScopePosition);
}

/** Per-family position eligibility override. Loosely keyed by string so the Zod
 *  validator and form parser stay simple; only ADVANCED_SCOPE_KEYS are read. */
export type AdvancedScope = Record<string, ScopePosition[]>;

/** Passing-production advanced components (accuracy flags, 5+ air-yard splits,
 *  sacks, EPA, incompletions) only score the passer — keeps a receiver's
 *  gadget-play dropback (and its wildly inflated per-dropback EPA) from leaking
 *  onto skill-position totals. Not configurable: non-QBs have ~0 of these. */
export const PASSING_POSITIONS = new Set(["QB"]);

export const DEFAULT_ADVANCED: AdvancedRules = {
  accurateThrow: 0,
  catchableThrow: 0,
  turnoverWorthyThrow: 0,
  heroThrow: 0,
  heroCatch: 0,
  drop: 0,
  missedTackleForced: 0,
  rushMtf: 0,
  recMtf: 0,
  passAirYd: 0,
  recAirYd: 0,
  recYacYd: 0,
  recYacoYd: 0,
  recFirstDown: 0,
  explosivePlay: 0,
  sepPoint: 0,
  sepM2: 0,
  sepM1: 0,
  sepP1: 0,
  sepP2: 0,
  sepP3: 0,
  sepP4: 0,
  rushStuff: 0,
  ybcYd: 0,
  yacoYd: 0,
  recFirstRead: 0,
  deepPassYd: 0,
  deepPassFirstDown: 0,
  deepPassTd: 0,
  sackTaken: 0,
  epaPerDropback: 0,
  epaTotal: 0,
  incompletion: 0,
  // scope omitted → ADVANCED_SCOPE_DEFAULTS apply (explosive→RB, Re1D→WR, …)
};

/** Team coaching staff (COACH roster slot) — scores the synthetic COACH-XX
 *  rows on scheme usage and team results. Only COACH stat lines carry these
 *  stats (NULL elsewhere), so the rules never leak onto individual players. */
export interface CoachingRules {
  paDropback: number; // per play-action dropback
  motionDropback: number; // per dropback with pre/at-snap motion
  /** Per 4th-down go-for-it snap — a real pass or run on 4th down (fake
   *  punts/FGs count; kneels don't). Optional so older saved sets validate. */
  fourthDownGo?: number;
  win: number; // bonus when the team wins
  score30Bonus: number; // bonus when the offense scores 30+ points
}

export const DEFAULT_COACHING: CoachingRules = {
  paDropback: 0.2,
  motionDropback: 0.1,
  fourthDownGo: 0,
  win: 5,
  score30Bonus: 10,
};

export interface ScoringRules {
  /** Preset this config was seeded from (informational; edits may diverge). */
  preset?: ScoringPresetKey;
  // ---- passing ----
  passYdsPerPoint: number; // 25 => 1 pt / 25 yds
  passTd: number;
  interception: number; // negative
  pass2pt: number;
  // ---- rushing ----
  rushYdsPerPoint: number;
  rushTd: number;
  rush2pt: number;
  // ---- receiving ----
  reception: number;
  /** TE-only reception value; falls back to `reception` when undefined. */
  tePremiumReception?: number;
  recYdsPerPoint: number;
  recTd: number;
  rec2pt: number;
  // ---- misc ----
  fumbleLost: number; // negative
  bonuses: YardageBonus[];
  // ---- non-offense ----
  kicking: KickingRules;
  dst: DstRules;
  idp?: IdpRules;
  /** Optional coaching-staff scoring (COACH roster slot); omitted = 0. */
  coaching?: CoachingRules;
  /** Optional advanced charting scoring; omitted = all zeros. */
  advanced?: AdvancedRules;
  /** Optional expected-fantasy-points scoring (per-position xFP multiplier);
   *  omitted = off for every position. */
  xfp?: XfpRules;
}

export const DEFAULT_KICKING: KickingRules = {
  fg0_39: 3,
  fg40_49: 4,
  fg50plus: 5,
  xp: 1,
  fgMiss: -1,
};

export const DEFAULT_DST: DstRules = {
  sack: 1,
  int: 2,
  fumRec: 2,
  td: 6,
  safety: 2,
  blockedKick: 2,
  paBrackets: [
    { max: 0, points: 10 },
    { max: 6, points: 7 },
    { max: 13, points: 4 },
    { max: 20, points: 1 },
    { max: 27, points: 0 },
    { max: 34, points: -1 },
    { max: 99, points: -4 },
  ],
};

/** Shared offensive base — INT and fumble-lost are -1 across every preset,
 *  matching the FantasyPoints.com convention (the validation source of truth). */
function offenseBase(): Omit<ScoringRules, "reception" | "preset" | "tePremiumReception" | "bonuses"> {
  return {
    passYdsPerPoint: 25,
    passTd: 4,
    interception: -1,
    pass2pt: 2,
    rushYdsPerPoint: 10,
    rushTd: 6,
    rush2pt: 2,
    recYdsPerPoint: 10,
    recTd: 6,
    rec2pt: 2,
    fumbleLost: -1,
    kicking: DEFAULT_KICKING,
    dst: DEFAULT_DST,
    coaching: { ...DEFAULT_COACHING },
  };
}

export const SCORING_PRESETS: Record<ScoringPresetKey, ScoringRules> = {
  ppr: { preset: "ppr", ...offenseBase(), reception: 1, bonuses: [] },
  standard: { preset: "standard", ...offenseBase(), reception: 0, bonuses: [] },
  half_ppr: { preset: "half_ppr", ...offenseBase(), reception: 0.5, bonuses: [] },
  te_premium: {
    preset: "te_premium",
    ...offenseBase(),
    reception: 1,
    tePremiumReception: 1.5,
    bonuses: [],
  },
  draftkings: {
    preset: "draftkings",
    ...offenseBase(),
    reception: 1,
    bonuses: [
      { stat: "pass_yds", threshold: 300, points: 3 },
      { stat: "rush_yds", threshold: 100, points: 3 },
      { stat: "rec_yds", threshold: 100, points: 3 },
    ],
  },
  fanduel: { preset: "fanduel", ...offenseBase(), reception: 0.5, bonuses: [] },
  /** The house format: PPR base for RB/WR/TE plus MTF (RBs), with QB passing
   *  scored on 5+ air-yard production, sacks, and EPA/dropback as plain additive
   *  advanced components (standard passing-yards/TD turned off so only the deep
   *  splits count). 12 teams. */
  fp_advanced: {
    preset: "fp_advanced",
    ...offenseBase(),
    passYdsPerPoint: 0, // QBs score deep (5+ air) passing only — see advanced.deepPass*
    passTd: 0,
    interception: -2,
    reception: 1,
    bonuses: [],
    advanced: {
      ...DEFAULT_ADVANCED,
      missedTackleForced: 2, // RB-only (scope key "mtf" → ADVANCED_SCOPE_DEFAULTS)
      deepPassYd: 0.25,
      deepPassFirstDown: 0.5,
      deepPassTd: 4,
      sackTaken: -1,
      epaPerDropback: 10,
    },
  },
};

export const SCORING_PRESET_OPTIONS: { key: ScoringPresetKey; label: string }[] = [
  { key: "fp_advanced", label: "FP Advanced" },
  { key: "ppr", label: "PPR" },
  { key: "standard", label: "Standard" },
  { key: "half_ppr", label: "Half-PPR" },
  { key: "te_premium", label: "TE-Premium" },
  { key: "draftkings", label: "DraftKings" },
  { key: "fanduel", label: "FanDuel" },
];

export function getScoringPreset(key?: string): ScoringRules {
  if (key && key in SCORING_PRESETS) return SCORING_PRESETS[key as ScoringPresetKey];
  return SCORING_PRESETS.ppr;
}
