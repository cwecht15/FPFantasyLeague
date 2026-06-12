/**
 * Scoring Lab form model: every editable scoring value as a flat field list,
 * so the form renders input boxes (no JSON) and the action parses them back
 * into a ScoringRules object. Kicking/DST stay at defaults — the platform
 * rosters no kickers or defenses.
 */

import {
  DEFAULT_ADVANCED,
  DEFAULT_COACHING,
  DEFAULT_DST,
  DEFAULT_KICKING,
  FP_QB_ADVANCED,
  SCORING_PRESETS,
  type ScoringRules,
} from "@/lib/scoring/scoring-systems";

export interface LabField {
  name: string;
  label: string;
  default: number;
  step?: number;
  hint?: string;
}

export interface LabFieldGroup {
  title: string;
  fields: LabField[];
}

const ppr = SCORING_PRESETS.ppr;

export const LAB_FIELD_GROUPS: LabFieldGroup[] = [
  {
    title: "Passing",
    fields: [
      { name: "passYdsPerPoint", label: "Yards per point", default: ppr.passYdsPerPoint, hint: "25 = 0.04/yd" },
      { name: "passTd", label: "Passing TD", default: ppr.passTd },
      { name: "interception", label: "Interception", default: ppr.interception },
      { name: "pass2pt", label: "2-pt pass", default: ppr.pass2pt },
    ],
  },
  {
    title: "Rushing",
    fields: [
      { name: "rushYdsPerPoint", label: "Yards per point", default: ppr.rushYdsPerPoint, hint: "10 = 0.1/yd" },
      { name: "rushTd", label: "Rushing TD", default: ppr.rushTd },
      { name: "rush2pt", label: "2-pt rush", default: ppr.rush2pt },
    ],
  },
  {
    title: "Receiving",
    fields: [
      { name: "reception", label: "Reception (PPR)", default: ppr.reception, step: 0.25 },
      { name: "tePremiumReception", label: "TE reception (premium)", default: ppr.reception, step: 0.25, hint: "set above Reception for TE premium" },
      { name: "recYdsPerPoint", label: "Yards per point", default: ppr.recYdsPerPoint },
      { name: "recTd", label: "Receiving TD", default: ppr.recTd },
      { name: "rec2pt", label: "2-pt catch", default: ppr.rec2pt },
    ],
  },
  {
    title: "Misc",
    fields: [{ name: "fumbleLost", label: "Fumble lost", default: ppr.fumbleLost }],
  },
  {
    title: "Yardage bonuses (points awarded at the weekly threshold; 0 = off)",
    fields: [
      { name: "bonusPassYdsThreshold", label: "Pass yds threshold", default: 300 },
      { name: "bonusPassYdsPoints", label: "Pass bonus points", default: 0 },
      { name: "bonusRushYdsThreshold", label: "Rush yds threshold", default: 100 },
      { name: "bonusRushYdsPoints", label: "Rush bonus points", default: 0 },
      { name: "bonusRecYdsThreshold", label: "Rec yds threshold", default: 100 },
      { name: "bonusRecYdsPoints", label: "Rec bonus points", default: 0 },
    ],
  },
  {
    title: "Advanced charting (per event / per yard; 0 = off)",
    fields: [
      { name: "advAccurateThrow", label: "Accurate throw", default: DEFAULT_ADVANCED.accurateThrow, step: 0.05, hint: "throws charted on-target: accuracy code ACC, BOD (frame), or AWY (away from coverage)" },
      { name: "advTurnoverWorthyThrow", label: "Turnover-worthy throw", default: DEFAULT_ADVANCED.turnoverWorthyThrow, step: 0.05, hint: "charted to_worthy flag — pass that should have been turned over" },
      { name: "advHeroThrow", label: "Hero throw", default: DEFAULT_ADVANCED.heroThrow, step: 0.25, hint: "charted wow/hero-throw flag on the passer" },
      { name: "advHeroCatch", label: "Hero catch", default: DEFAULT_ADVANCED.heroCatch, step: 0.25, hint: "charted highlight/hero-catch flag on the receiver" },
      { name: "advDrop", label: "Drop", default: DEFAULT_ADVANCED.drop, step: 0.25, hint: "incompletion charted DP — receiver dropped a catchable ball" },
      { name: "advMissedTackleForced", label: "Missed tackle forced", default: DEFAULT_ADVANCED.missedTackleForced, step: 0.05, hint: "charted missed tackles forced as the ball carrier (carries + catch-and-run) — use the rush/rec splits instead for different rates (don't set both)" },
      { name: "advRushMtf", label: "Rushing MTF", default: DEFAULT_ADVANCED.rushMtf ?? 0, step: 0.25, hint: "missed tackles forced as a rusher only — pairs with Receiving MTF; leave combined MTF at 0 when using these" },
      { name: "advRecMtf", label: "Receiving MTF", default: DEFAULT_ADVANCED.recMtf ?? 0, step: 0.25, hint: "missed tackles forced on catch-and-run only" },
      { name: "advPassAirYd", label: "Pass air yards (per yd)", default: DEFAULT_ADVANCED.passAirYd, step: 0.005, hint: "charted throw depth (LOS to catch point) summed over all attempts" },
      { name: "advRecAirYd", label: "Rec air yards (per yd)", default: DEFAULT_ADVANCED.recAirYd, step: 0.005, hint: "charted throw depth summed over all targets" },
      { name: "advRecYacYd", label: "YAC (per yd)", default: DEFAULT_ADVANCED.recYacYd, step: 0.005, hint: "yards after catch on receptions" },
      { name: "advRecYacoYd", label: "Rec YACO (per yd)", default: DEFAULT_ADVANCED.recYacoYd ?? 0, step: 0.005, hint: "receiving yards after contact — the after-contact share of YAC" },
      { name: "advRecFirstDown", label: "Receiving 1st down", default: DEFAULT_ADVANCED.recFirstDown ?? 0, step: 0.25, hint: "receptions that converted a first down" },
      { name: "advExplosivePlay", label: "Explosive play", default: DEFAULT_ADVANCED.explosivePlay ?? 0, step: 0.5, hint: "rushes or receptions of 15+ yards" },
      { name: "advSepPoint", label: "Separation (per route pt)", default: DEFAULT_ADVANCED.sepPoint, step: 0.05, hint: "per-route separation score (-2 pressed … +4 bust) summed across every route run — use the per-grade group below for non-linear scoring" },
      { name: "advRushStuff", label: "Rushing stuff", default: DEFAULT_ADVANCED.rushStuff, step: 0.25, hint: "carries stopped at or behind the LOS (≤0 yds; kneels excluded) — set negative" },
      { name: "advYbcYd", label: "YBC (per yd)", default: DEFAULT_ADVANCED.ybcYd, step: 0.005, hint: "rushing yards before first contact" },
      { name: "advYacoYd", label: "YACO (per yd)", default: DEFAULT_ADVANCED.yacoYd, step: 0.005, hint: "rushing yards after contact — boost above YBC to reward broken tackles" },
    ],
  },
  {
    title: "Per-route separation grades (points per route at each grade; 0 = off)",
    fields: [
      { name: "advSepM2", label: "−2 pressed at line", default: DEFAULT_ADVANCED.sepM2 ?? 0, step: 0.5, hint: "routes where the receiver was jammed at the LOS — set negative" },
      { name: "advSepM1", label: "−1 tight", default: DEFAULT_ADVANCED.sepM1 ?? 0, step: 0.5, hint: "routes run into tight coverage — set negative" },
      { name: "advSepP1", label: "+1 step", default: DEFAULT_ADVANCED.sepP1 ?? 0, step: 0.5, hint: "routes with roughly one step of separation" },
      { name: "advSepP2", label: "+2 open", default: DEFAULT_ADVANCED.sepP2 ?? 0, step: 0.5, hint: "routes with more than a step of separation" },
      { name: "advSepP3", label: "+3 wide open", default: DEFAULT_ADVANCED.sepP3 ?? 0, step: 0.5, hint: "routes with significant separation" },
      { name: "advSepP4", label: "+4 coverage bust", default: DEFAULT_ADVANCED.sepP4 ?? 0, step: 0.5, hint: "routes left fully uncovered by a coverage breakdown" },
    ],
  },
  {
    title: "Coaching staff (scores the COACH roster slot — team scheme + results)",
    fields: [
      { name: "coachPaDropback", label: "Play-action dropback", default: DEFAULT_COACHING.paDropback, step: 0.05, hint: "every team dropback off play-action" },
      { name: "coachMotionDropback", label: "Dropback w/ motion", default: DEFAULT_COACHING.motionDropback, step: 0.05, hint: "every team dropback with pre-snap or at-snap motion" },
      { name: "coachFourthDownGo", label: "4th-down go", default: DEFAULT_COACHING.fourthDownGo ?? 0, step: 0.25, hint: "going for it on 4th down — a real pass or run snap (fake punts/FGs count; kneels don't)" },
      { name: "coachWin", label: "Team win", default: DEFAULT_COACHING.win, step: 0.5, hint: "bonus when the team wins (ties score 0)" },
      { name: "coachScore30", label: "30+ points scored", default: DEFAULT_COACHING.score30Bonus, step: 0.5, hint: "bonus when the offense finishes with 30 or more points" },
    ],
  },
];

/** QB advanced mode — replaces ALL standard QB scoring when enabled.
 *  Excludes passing production on throws under 5 air yards. */
export const QB_FIELD_GROUP: LabFieldGroup = {
  title: "QB advanced mode (replaces standard QB scoring when enabled)",
  fields: [
    { name: "qbDeepYd", label: "Pass yds 5+ air (per yd)", default: FP_QB_ADVANCED.deepYd, step: 0.01, hint: "passing yards gained on throws of 5+ air yards only" },
    { name: "qbDeepFirstDown", label: "Passing 1st down (5+ air)", default: FP_QB_ADVANCED.deepFirstDown, step: 0.25, hint: "completions of 5+ air yards that converted a first down" },
    { name: "qbDeepTd", label: "Passing TD (5+ air)", default: FP_QB_ADVANCED.deepTd, step: 0.5, hint: "passing TDs on throws of 5+ air yards" },
    { name: "qbSack", label: "Sack taken", default: FP_QB_ADVANCED.sack, step: 0.25, hint: "sacks (incl. half-sacks) charged to the QB" },
    { name: "qbInt", label: "Interception", default: FP_QB_ADVANCED.interception, step: 0.5, hint: "all interceptions thrown (any depth)" },
    { name: "qbRushYd", label: "Rush yds (per yd)", default: FP_QB_ADVANCED.rushYd, step: 0.01, hint: "QB rushing yards (0 = rushing yardage doesn't score)" },
    { name: "qbRushTd", label: "Rushing TD", default: FP_QB_ADVANCED.rushTd, step: 0.5, hint: "QB rushing touchdowns" },
    { name: "qbEpaPerDb", label: "EPA/dropback ×", default: FP_QB_ADVANCED.epaPerDropback, step: 1, hint: "week EPA summed over dropbacks, divided by dropbacks, times this multiplier (efficiency option — e.g. ×10)" },
    { name: "qbEpaTotal", label: "EPA total ×", default: FP_QB_ADVANCED.epaTotal ?? 0, step: 0.5, hint: "week EPA summed over dropbacks, times this multiplier (volume option — e.g. ×2.5; zero out EPA/dropback when using this)" },
  ],
};

/** Current value of a named form field, read out of an existing rules object —
 *  lets the league settings editor pre-fill the same field groups. */
function ruleValue(rules: ScoringRules, name: string): number | undefined {
  const a = rules.advanced;
  const q = rules.qbAdvanced;
  const c = rules.coaching;
  const bonus = (stat: string) => rules.bonuses.find((b) => b.stat === stat);
  const map: Record<string, number | undefined> = {
    passYdsPerPoint: rules.passYdsPerPoint,
    passTd: rules.passTd,
    interception: rules.interception,
    pass2pt: rules.pass2pt,
    rushYdsPerPoint: rules.rushYdsPerPoint,
    rushTd: rules.rushTd,
    rush2pt: rules.rush2pt,
    reception: rules.reception,
    tePremiumReception: rules.tePremiumReception ?? rules.reception,
    recYdsPerPoint: rules.recYdsPerPoint,
    recTd: rules.recTd,
    rec2pt: rules.rec2pt,
    fumbleLost: rules.fumbleLost,
    bonusPassYdsThreshold: bonus("pass_yds")?.threshold ?? 300,
    bonusPassYdsPoints: bonus("pass_yds")?.points ?? 0,
    bonusRushYdsThreshold: bonus("rush_yds")?.threshold ?? 100,
    bonusRushYdsPoints: bonus("rush_yds")?.points ?? 0,
    bonusRecYdsThreshold: bonus("rec_yds")?.threshold ?? 100,
    bonusRecYdsPoints: bonus("rec_yds")?.points ?? 0,
    advAccurateThrow: a?.accurateThrow ?? 0,
    advTurnoverWorthyThrow: a?.turnoverWorthyThrow ?? 0,
    advHeroThrow: a?.heroThrow ?? 0,
    advHeroCatch: a?.heroCatch ?? 0,
    advDrop: a?.drop ?? 0,
    advMissedTackleForced: a?.missedTackleForced ?? 0,
    advRushMtf: a?.rushMtf ?? 0,
    advRecMtf: a?.recMtf ?? 0,
    advPassAirYd: a?.passAirYd ?? 0,
    advRecAirYd: a?.recAirYd ?? 0,
    advRecYacYd: a?.recYacYd ?? 0,
    advRecYacoYd: a?.recYacoYd ?? 0,
    advRecFirstDown: a?.recFirstDown ?? 0,
    advExplosivePlay: a?.explosivePlay ?? 0,
    advSepPoint: a?.sepPoint ?? 0,
    advSepM2: a?.sepM2 ?? 0,
    advSepM1: a?.sepM1 ?? 0,
    advSepP1: a?.sepP1 ?? 0,
    advSepP2: a?.sepP2 ?? 0,
    advSepP3: a?.sepP3 ?? 0,
    advSepP4: a?.sepP4 ?? 0,
    advRushStuff: a?.rushStuff ?? 0,
    advYbcYd: a?.ybcYd ?? 0,
    advYacoYd: a?.yacoYd ?? 0,
    coachPaDropback: c?.paDropback ?? DEFAULT_COACHING.paDropback,
    coachMotionDropback: c?.motionDropback ?? DEFAULT_COACHING.motionDropback,
    coachFourthDownGo: c?.fourthDownGo ?? 0,
    coachWin: c?.win ?? DEFAULT_COACHING.win,
    coachScore30: c?.score30Bonus ?? DEFAULT_COACHING.score30Bonus,
    qbDeepYd: q?.deepYd ?? FP_QB_ADVANCED.deepYd,
    qbDeepFirstDown: q?.deepFirstDown ?? FP_QB_ADVANCED.deepFirstDown,
    qbDeepTd: q?.deepTd ?? FP_QB_ADVANCED.deepTd,
    qbSack: q?.sack ?? FP_QB_ADVANCED.sack,
    qbInt: q?.interception ?? FP_QB_ADVANCED.interception,
    qbRushYd: q?.rushYd ?? FP_QB_ADVANCED.rushYd,
    qbRushTd: q?.rushTd ?? FP_QB_ADVANCED.rushTd,
    qbEpaPerDb: q?.epaPerDropback ?? FP_QB_ADVANCED.epaPerDropback,
    qbEpaTotal: q?.epaTotal ?? FP_QB_ADVANCED.epaTotal ?? 0,
  };
  return map[name];
}

function withDefaults(group: LabFieldGroup, rules: ScoringRules): LabFieldGroup {
  return {
    ...group,
    fields: group.fields.map((f) => ({ ...f, default: ruleValue(rules, f.name) ?? f.default })),
  };
}

/** Field groups pre-filled from an existing rules object (settings editor). */
export function groupsFromRules(rules: ScoringRules): {
  groups: LabFieldGroup[];
  qbGroup: LabFieldGroup;
  qbEnabled: boolean;
} {
  return {
    groups: LAB_FIELD_GROUPS.map((g) => withDefaults(g, rules)),
    qbGroup: withDefaults(QB_FIELD_GROUP, rules),
    qbEnabled: !!rules.qbAdvanced,
  };
}

const num = (formData: FormData, name: string, fallback: number): number => {
  const raw = formData.get(name);
  if (raw === null || String(raw).trim() === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
};

/** Parse the lab form's flat fields back into a ScoringRules object. */
export function rulesFromForm(formData: FormData): ScoringRules {
  const bonuses: ScoringRules["bonuses"] = [];
  const bonusDefs = [
    ["pass_yds", "bonusPassYdsThreshold", "bonusPassYdsPoints"],
    ["rush_yds", "bonusRushYdsThreshold", "bonusRushYdsPoints"],
    ["rec_yds", "bonusRecYdsThreshold", "bonusRecYdsPoints"],
  ] as const;
  for (const [stat, tName, pName] of bonusDefs) {
    const threshold = num(formData, tName, 0);
    const points = num(formData, pName, 0);
    if (threshold > 0 && points !== 0) bonuses.push({ stat, threshold, points });
  }

  const reception = num(formData, "reception", 1);
  const tePrem = num(formData, "tePremiumReception", reception);

  return {
    passYdsPerPoint: Math.max(num(formData, "passYdsPerPoint", 25), 0.0001),
    passTd: num(formData, "passTd", 4),
    interception: num(formData, "interception", -1),
    pass2pt: num(formData, "pass2pt", 2),
    rushYdsPerPoint: Math.max(num(formData, "rushYdsPerPoint", 10), 0.0001),
    rushTd: num(formData, "rushTd", 6),
    rush2pt: num(formData, "rush2pt", 2),
    reception,
    ...(tePrem !== reception ? { tePremiumReception: tePrem } : {}),
    recYdsPerPoint: Math.max(num(formData, "recYdsPerPoint", 10), 0.0001),
    recTd: num(formData, "recTd", 6),
    rec2pt: num(formData, "rec2pt", 2),
    fumbleLost: num(formData, "fumbleLost", -1),
    bonuses,
    kicking: DEFAULT_KICKING,
    dst: DEFAULT_DST,
    coaching: {
      paDropback: num(formData, "coachPaDropback", DEFAULT_COACHING.paDropback),
      motionDropback: num(formData, "coachMotionDropback", DEFAULT_COACHING.motionDropback),
      fourthDownGo: num(formData, "coachFourthDownGo", 0),
      win: num(formData, "coachWin", DEFAULT_COACHING.win),
      score30Bonus: num(formData, "coachScore30", DEFAULT_COACHING.score30Bonus),
    },
    advanced: {
      accurateThrow: num(formData, "advAccurateThrow", 0),
      turnoverWorthyThrow: num(formData, "advTurnoverWorthyThrow", 0),
      heroThrow: num(formData, "advHeroThrow", 0),
      heroCatch: num(formData, "advHeroCatch", 0),
      drop: num(formData, "advDrop", 0),
      missedTackleForced: num(formData, "advMissedTackleForced", 0),
      rushMtf: num(formData, "advRushMtf", 0),
      recMtf: num(formData, "advRecMtf", 0),
      passAirYd: num(formData, "advPassAirYd", 0),
      recAirYd: num(formData, "advRecAirYd", 0),
      recYacYd: num(formData, "advRecYacYd", 0),
      recYacoYd: num(formData, "advRecYacoYd", 0),
      recFirstDown: num(formData, "advRecFirstDown", 0),
      explosivePlay: num(formData, "advExplosivePlay", 0),
      sepPoint: num(formData, "advSepPoint", 0),
      sepM2: num(formData, "advSepM2", 0),
      sepM1: num(formData, "advSepM1", 0),
      sepP1: num(formData, "advSepP1", 0),
      sepP2: num(formData, "advSepP2", 0),
      sepP3: num(formData, "advSepP3", 0),
      sepP4: num(formData, "advSepP4", 0),
      rushStuff: num(formData, "advRushStuff", 0),
      ybcYd: num(formData, "advYbcYd", 0),
      yacoYd: num(formData, "advYacoYd", 0),
    },
    ...(formData.get("qbAdvancedEnabled") === "on"
      ? {
          qbAdvanced: {
            deepYd: num(formData, "qbDeepYd", FP_QB_ADVANCED.deepYd),
            deepFirstDown: num(formData, "qbDeepFirstDown", FP_QB_ADVANCED.deepFirstDown),
            deepTd: num(formData, "qbDeepTd", FP_QB_ADVANCED.deepTd),
            sack: num(formData, "qbSack", FP_QB_ADVANCED.sack),
            interception: num(formData, "qbInt", FP_QB_ADVANCED.interception),
            rushYd: num(formData, "qbRushYd", FP_QB_ADVANCED.rushYd),
            rushTd: num(formData, "qbRushTd", FP_QB_ADVANCED.rushTd),
            epaPerDropback: num(formData, "qbEpaPerDb", FP_QB_ADVANCED.epaPerDropback),
            epaTotal: num(formData, "qbEpaTotal", 0),
          },
        }
      : {}),
  };
}
