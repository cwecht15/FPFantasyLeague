/**
 * League configuration: roster template, draft/waiver/playoff config, and the
 * scoring-rules validator. All four live as JSONB on `league_settings` and are
 * validated with Zod on write (the DB can't enforce their shape). Defaults seed
 * a sensible standard league.
 */

import { z } from "zod";
import type { ScoringRules } from "@/lib/scoring/scoring-systems";
import { getScoringPreset } from "@/lib/scoring/scoring-systems";

// ---------------------------------------------------------------------------
// Roster template
// ---------------------------------------------------------------------------

export const ROSTER_SLOTS = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "SUPERFLEX",
  "COACH",
  "K",
  "DST",
  "DL",
  "LB",
  "DB",
  "IDP",
  "BENCH",
  "IR",
] as const;
export type RosterSlot = (typeof ROSTER_SLOTS)[number];

/** Which player positions can fill a given slot. Used by lineup validation. */
export const SLOT_ELIGIBILITY: Record<RosterSlot, string[]> = {
  QB: ["QB"],
  RB: ["RB"],
  WR: ["WR"],
  TE: ["TE"],
  FLEX: ["RB", "WR", "TE"],
  SUPERFLEX: ["QB", "RB", "WR", "TE"],
  COACH: ["COACH"],
  K: ["K"],
  DST: ["DST"],
  DL: ["DL"],
  LB: ["LB"],
  DB: ["DB"],
  IDP: ["DL", "LB", "DB"],
  BENCH: [], // anything
  IR: [], // anything (injured)
};

export const rosterTemplateSchema = z.object({
  slots: z
    .array(
      z.object({
        slot: z.enum(ROSTER_SLOTS),
        count: z.number().int().min(0).max(20),
        /** Override SLOT_ELIGIBILITY for custom FLEX configs. */
        eligible: z.array(z.string()).optional(),
      }),
    )
    .min(1),
});
export type RosterTemplate = z.infer<typeof rosterTemplateSchema>;

// Platform rule: no kickers, no defenses — offense-only rosters, plus the
// team coaching-staff slot (scheme usage + team results).
// House roster (owner spec): QB / RB / RB / WR / WR / TE / FLEX / COACH,
// plus 4 bench. 8 starters, 12 total, no IR.
export const DEFAULT_ROSTER_TEMPLATE: RosterTemplate = {
  slots: [
    { slot: "QB", count: 1 },
    { slot: "RB", count: 2 },
    { slot: "WR", count: 2 },
    { slot: "TE", count: 1 },
    { slot: "FLEX", count: 1 },
    { slot: "COACH", count: 1 },
    { slot: "BENCH", count: 4 },
  ],
};

/** Positions the platform actually rosters (no K, no DST/IDP). */
export const ACTIVE_POSITIONS = ["QB", "RB", "WR", "TE", "COACH"] as const;

/** Slots offered in the admin settings UI (schema supports more for legacy). */
export const ACTIVE_SLOTS: RosterSlot[] = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "SUPERFLEX",
  "COACH",
  "BENCH",
  "IR",
];

/** Total non-bench/non-IR starters — the number of player_week_scores summed
 *  into a team's weekly total. */
export function starterSlots(t: RosterTemplate): { slot: RosterSlot; count: number; eligible?: string[] }[] {
  return t.slots.filter((s) => s.slot !== "BENCH" && s.slot !== "IR" && s.count > 0);
}

// ---------------------------------------------------------------------------
// Draft config
// ---------------------------------------------------------------------------

export const draftConfigSchema = z.object({
  type: z.enum(["snake"]).default("snake"),
  /** Seconds on the clock per pick; 0 = no clock (picks never expire or
   *  autopick — the draft moves only when managers pick). Default 8h. */
  secondsPerPick: z
    .number()
    .int()
    .min(0)
    .max(7 * 24 * 3600)
    .refine((v) => v === 0 || v >= 30, "use 0 (no clock) or at least 30 seconds")
    .default(8 * 3600),
  orderMode: z.enum(["manual", "random", "reverse_standings"]).default("random"),
  thirdRoundReversal: z.boolean().default(false),
  // Matches the default roster template size (15 slots incl. bench + IR).
  rounds: z.number().int().min(1).max(40).default(15),
});
export type DraftConfig = z.infer<typeof draftConfigSchema>;

export const DEFAULT_DRAFT_CONFIG: DraftConfig = draftConfigSchema.parse({});

// ---------------------------------------------------------------------------
// Waiver config
// ---------------------------------------------------------------------------

export const waiverConfigSchema = z.object({
  /** House rule: "faab" game-lock waivers — players are instant free agents
   *  until their NFL game kicks off, then locked (roster and pool alike) and
   *  only claimable by blind FAAB bid until claims process. Ties go to the
   *  worse record. "priority" is the legacy always-claim mode; "none" is
   *  pure first-come free agency. */
  mode: z.enum(["priority", "faab", "none"]).default("faab"),
  /** Day-of-week claims process (0=Sun … 6=Sat). */
  processDow: z.number().int().min(0).max(6).default(3), // Wednesday
  /** Hour (America/New_York) claims process — 3:00 AM ET per house rule.
   *  Older stored configs may carry a legacy processHourUtc instead; readers
   *  fall back to 3 when this is absent. */
  processHourEt: z.number().int().min(0).max(23).default(3),
  faabBudget: z.number().int().min(0).max(10000).default(100),
});
export type WaiverConfig = z.infer<typeof waiverConfigSchema>;

export const DEFAULT_WAIVER_CONFIG: WaiverConfig = waiverConfigSchema.parse({});

// ---------------------------------------------------------------------------
// Playoff config
// ---------------------------------------------------------------------------

export const playoffConfigSchema = z.object({
  /** "bracket" (the house format): top `teams` by WINS — points-for breaks
   *  ties, which is exactly the standings rank — seed a bracket starting at
   *  `startWeek`, one week per round, top seeds bye when the field isn't a
   *  power of two. See lib/matchups/playoffs.ts. "championship" is the retired
   *  cross-league sprint (its page was removed 2026-08-14); the value stays in
   *  the enum so old stored configs still parse. */
  mode: z.enum(["championship", "bracket"]).default("bracket"),
  teams: z.number().int().min(2).max(16).default(6),
  startWeek: z.number().int().min(1).max(18).default(15),
  weeksPerRound: z.number().int().min(1).max(2).default(1),
});
export type PlayoffConfig = z.infer<typeof playoffConfigSchema>;

export const DEFAULT_PLAYOFF_CONFIG: PlayoffConfig = playoffConfigSchema.parse({});

// ---------------------------------------------------------------------------
// Scoring rules validator (validates the ScoringRules type from the scoring lib)
// ---------------------------------------------------------------------------

export const scoringRulesSchema: z.ZodType<ScoringRules> = z.object({
  preset: z
    .enum(["ppr", "standard", "half_ppr", "te_premium", "draftkings", "fanduel", "fp_advanced"])
    .optional(),
  passYdsPerPoint: z.number().nonnegative(), // 0 = passing yards don't score
  passTd: z.number(),
  interception: z.number(),
  pass2pt: z.number(),
  rushYdsPerPoint: z.number().nonnegative(),
  rushTd: z.number(),
  rush2pt: z.number(),
  reception: z.number(),
  tePremiumReception: z.number().optional(),
  recYdsPerPoint: z.number().nonnegative(),
  recTd: z.number(),
  rec2pt: z.number(),
  fumbleLost: z.number(),
  bonuses: z.array(
    z.object({
      stat: z.enum(["pass_yds", "rush_yds", "rec_yds"]),
      threshold: z.number(),
      points: z.number(),
    }),
  ),
  kicking: z.object({
    fg0_39: z.number(),
    fg40_49: z.number(),
    fg50plus: z.number(),
    xp: z.number(),
    fgMiss: z.number(),
  }),
  dst: z.object({
    sack: z.number(),
    int: z.number(),
    fumRec: z.number(),
    td: z.number(),
    safety: z.number(),
    blockedKick: z.number(),
    paBrackets: z.array(z.object({ max: z.number(), points: z.number() })).min(1),
  }),
  idp: z
    .object({
      soloTackle: z.number(),
      assist: z.number(),
      sack: z.number(),
      tfl: z.number(),
      passDef: z.number(),
      int: z.number(),
      fumRec: z.number(),
      forcedFumble: z.number(),
      td: z.number(),
    })
    .optional(),
  coaching: z
    .object({
      paDropback: z.number(),
      motionDropback: z.number(),
      fourthDownGo: z.number().optional(),
      run2ndLong: z.number().optional(),
      deepAtt2ndShort: z.number().optional(),
      win: z.number(),
      score30Bonus: z.number(),
    })
    .optional(),
  advanced: z
    .object({
      accurateThrow: z.number(),
      catchableThrow: z.number().optional(),
      turnoverWorthyThrow: z.number(),
      heroThrow: z.number(),
      heroCatch: z.number(),
      drop: z.number(),
      missedTackleForced: z.number(),
      rushMtf: z.number().optional(),
      recMtf: z.number().optional(),
      passAirYd: z.number(),
      recAirYd: z.number(),
      recYacYd: z.number(),
      recYacoYd: z.number().optional(),
      recFirstDown: z.number().optional(),
      explosivePlay: z.number().optional(),
      rushExplosive: z.number().optional(),
      recExplosive: z.number().optional(),
      sepPoint: z.number(),
      sepM2: z.number().optional(),
      sepM1: z.number().optional(),
      sepP1: z.number().optional(),
      sepP2: z.number().optional(),
      sepP3: z.number().optional(),
      sepP4: z.number().optional(),
      rushStuff: z.number(),
      ybcYd: z.number(),
      yacoYd: z.number(),
      recFirstRead: z.number().optional(),
      deepPassYd: z.number().optional(),
      deepPassFirstDown: z.number().optional(),
      deepPassTd: z.number().optional(),
      sackTaken: z.number().optional(),
      epaPerDropback: z.number().optional(),
      epaTotal: z.number().optional(),
      incompletion: z.number().optional(),
      scope: z.record(z.string(), z.array(z.enum(["QB", "RB", "WR", "TE"]))).optional(),
    })
    .optional(),
  xfp: z
    .object({
      qb: z.number(),
      rb: z.number(),
      wr: z.number(),
      te: z.number(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Bundle helper
// ---------------------------------------------------------------------------

export interface LeagueSettingsBundle {
  rosterTemplate: RosterTemplate;
  scoringRules: ScoringRules;
  draftConfig: DraftConfig;
  waiverConfig: WaiverConfig;
  playoffConfig: PlayoffConfig;
}

export function defaultLeagueSettings(scoringPreset = "ppr"): LeagueSettingsBundle {
  return {
    rosterTemplate: DEFAULT_ROSTER_TEMPLATE,
    scoringRules: getScoringPreset(scoringPreset),
    draftConfig: DEFAULT_DRAFT_CONFIG,
    waiverConfig: DEFAULT_WAIVER_CONFIG,
    playoffConfig: DEFAULT_PLAYOFF_CONFIG,
  };
}
