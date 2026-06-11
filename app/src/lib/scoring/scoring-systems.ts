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
 *  YAC, and missed tackles forced. */
export interface AdvancedRules {
  accurateThrow: number; // per on-target throw (acc in ACC/BOD/AWY)
  turnoverWorthyThrow: number; // typically negative
  heroThrow: number; // charted wow/hero throw
  heroCatch: number; // charted highlight catch
  drop: number; // typically negative
  missedTackleForced: number;
  passAirYd: number; // per completed-attempt air yard thrown
  recAirYd: number; // per targeted air yard
  recYacYd: number; // per yard after catch
  sepPoint: number; // per separation point accumulated across routes (-2..+4 each)
  rushStuff: number; // per carry stopped at/behind the LOS — typically negative
  ybcYd: number; // per rushing yard before contact
  yacoYd: number; // per rushing yard after contact
}

export const DEFAULT_ADVANCED: AdvancedRules = {
  accurateThrow: 0,
  turnoverWorthyThrow: 0,
  heroThrow: 0,
  heroCatch: 0,
  drop: 0,
  missedTackleForced: 0,
  passAirYd: 0,
  recAirYd: 0,
  recYacYd: 0,
  sepPoint: 0,
  rushStuff: 0,
  ybcYd: 0,
  yacoYd: 0,
};

/** QB advanced mode: REPLACES standard offense scoring for QBs. Only
 *  production on throws of 5+ air yards counts; sacks and EPA/dropback are
 *  first-class. (Fumbles lost still score via the base fumbleLost value.) */
export interface QbAdvancedRules {
  deepYd: number; // per passing yard on 5+ air-yard throws
  deepFirstDown: number; // per passing first down on 5+ air-yard throws
  deepTd: number; // per passing TD on 5+ air-yard throws
  sack: number; // per sack taken — typically negative
  interception: number; // per INT — typically negative
  rushYd: number; // per QB rushing yard
  rushTd: number; // per QB rushing TD
  epaPerDropback: number; // points per unit of (EPA total / dropbacks)
}

export const FP_QB_ADVANCED: QbAdvancedRules = {
  deepYd: 0.25,
  deepFirstDown: 0.5,
  deepTd: 4,
  sack: -1,
  interception: -2,
  rushYd: 0,
  rushTd: 4,
  epaPerDropback: 10,
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
  /** Optional advanced charting scoring; omitted = all zeros. */
  advanced?: AdvancedRules;
  /** Optional QB advanced mode — replaces standard QB offense scoring. */
  qbAdvanced?: QbAdvancedRules;
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
  /** The house format: PPR base for RB/WR/TE plus MTF, with QBs scored in
   *  advanced mode (5+ air-yard production, sacks, EPA/dropback). 12 teams. */
  fp_advanced: {
    preset: "fp_advanced",
    ...offenseBase(),
    reception: 1,
    bonuses: [],
    advanced: { ...DEFAULT_ADVANCED, missedTackleForced: 2 },
    qbAdvanced: { ...FP_QB_ADVANCED },
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
