import { describe, expect, it } from "vitest";
import { scoreStatLine } from "./score-stat-line";
import { SCORING_PRESETS } from "./scoring-systems";

const ppr = SCORING_PRESETS.ppr;
const standard = SCORING_PRESETS.standard;
const half = SCORING_PRESETS.half_ppr;
const tep = SCORING_PRESETS.te_premium;
const dk = SCORING_PRESETS.draftkings;

describe("scoreStatLine — offense", () => {
  it("scores a QB line (Tua W1 2024: 338 pass yds, 1 TD, 0 INT)", () => {
    const { points } = scoreStatLine({ passYds: 338, passTd: 1, passInt: 0 }, ppr);
    // 338/25 + 1*4 = 13.52 + 4
    expect(points).toBeCloseTo(17.52, 2);
  });

  it("PPR vs Standard vs Half differ only by receptions", () => {
    const line = { rushYds: 50, rushTd: 1, receptions: 6, recYds: 70, recTd: 1 };
    const base = 50 / 10 + 6 + 70 / 10 + 6; // rush 5 + rushTd 6 + recYds 7 + recTd 6 = 24, plus receptions
    expect(scoreStatLine(line, standard).points).toBeCloseTo(24, 2);
    expect(scoreStatLine(line, half).points).toBeCloseTo(24 + 6 * 0.5, 2);
    expect(scoreStatLine(line, ppr).points).toBeCloseTo(24 + 6 * 1, 2);
  });

  it("TE-premium boosts receptions only for tight ends", () => {
    const line = { receptions: 5, recYds: 50 };
    expect(scoreStatLine(line, tep).points).toBeCloseTo(5 * 1 + 5, 2); // not TE -> 1.0
    expect(scoreStatLine(line, tep, { isTightEnd: true }).points).toBeCloseTo(5 * 1.5 + 5, 2);
  });

  it("applies DraftKings yardage bonuses on weekly totals", () => {
    const line = { recYds: 100, receptions: 8 };
    // 100/10 + 8*1 + 3 (100-yd bonus) = 10 + 8 + 3
    expect(scoreStatLine(line, dk).points).toBeCloseTo(21, 2);
  });

  it("penalizes interceptions and fumbles", () => {
    const { points } = scoreStatLine({ passYds: 0, passInt: 2, fumblesLost: 1 }, ppr);
    expect(points).toBeCloseTo(-3, 2);
  });

  it("yards-per-point of 0 turns the yardage component off (zeroed-out rules)", () => {
    const zeroed = { ...ppr, passYdsPerPoint: 0, rushYdsPerPoint: 0, recYdsPerPoint: 0, reception: 0 };
    const line = { passYds: 300, rushYds: 80, recYds: 90, receptions: 7 };
    expect(scoreStatLine(line, zeroed).points).toBeCloseTo(0, 2);
  });
});

describe("scoreStatLine — kicker", () => {
  it("buckets field goals by distance and adds XPs", () => {
    const line = { fgMade30_39: 1, fgMade40_49: 2, fgMade50plus: 1, xpMade: 3 };
    // 1*3 + 2*4 + 1*5 + 3*1 = 3 + 8 + 5 + 3
    expect(scoreStatLine(line, ppr).points).toBeCloseTo(19, 2);
  });
});

describe("scoreStatLine — DST", () => {
  it("scores sacks/INT/fumbles and points-allowed brackets (allowed 28 -> -1)", () => {
    const line = { dstSacks: 4, dstInt: 0, dstFumRec: 1, pointsAllowed: 28 };
    // 4*1 + 1*2 + bracket(28 -> max34 -> -1) = 4 + 2 - 1
    expect(scoreStatLine(line, ppr).points).toBeCloseTo(5, 2);
  });

  it("shutout points-allowed bracket pays 10", () => {
    expect(scoreStatLine({ pointsAllowed: 0 }, ppr).points).toBeCloseTo(10, 2);
  });
});

describe("scoreStatLine — coaching staff (COACH)", () => {
  // All presets carry the default coaching rules: 0.2/PA dropback,
  // 0.1/motion dropback, +5 win, +10 at 30+ points scored.
  it("scores PA dropbacks, motion dropbacks, win, and the 30-point bonus", () => {
    const line = { paDropbacks: 12, motionDropbacks: 20, teamWin: 1, teamPointsScored: 31 };
    // 12*0.2 + 20*0.1 + 5 + 10 = 2.4 + 2 + 15
    expect(scoreStatLine(line, ppr).points).toBeCloseTo(19.4, 2);
  });

  it("no win/30+ bonus on a 24-point loss; exactly 30 earns the bonus", () => {
    const loss = { paDropbacks: 10, motionDropbacks: 10, teamWin: 0, teamPointsScored: 24 };
    expect(scoreStatLine(loss, ppr).points).toBeCloseTo(10 * 0.2 + 10 * 0.1, 2);
    const exactly30 = { teamWin: 0, teamPointsScored: 30 };
    expect(scoreStatLine(exactly30, ppr).points).toBeCloseTo(10, 2);
  });

  it("missing team result (game not final) scores no result bonuses", () => {
    const line = { paDropbacks: 5, motionDropbacks: 5 };
    expect(scoreStatLine(line, ppr).points).toBeCloseTo(5 * 0.2 + 5 * 0.1, 2);
  });

  it("4th-down go-for-it scores per attempt when configured (default off)", () => {
    const line = { fourthDownAttempts: 3 };
    expect(scoreStatLine(line, ppr).points).toBeCloseTo(0, 2); // default 0 = off
    const rules = { ...ppr, coaching: { ...ppr.coaching!, fourthDownGo: 2 } };
    expect(scoreStatLine(line, rules).points).toBeCloseTo(6, 2);
  });
});

describe("scoreStatLine — new advanced charting options", () => {
  const rules = (advanced: Partial<NonNullable<typeof ppr.advanced>>) => ({
    ...ppr,
    advanced: { ...SCORING_PRESETS.fp_advanced.advanced!, missedTackleForced: 0, ...advanced },
  });

  it("RB option B: rush MTF 1.5 / rec MTF 3, rush YACO .1 / rec YACO .2, explosives 6", () => {
    const line = {
      rushMtf: 4, recMtf: 2, rushYaco: 30, recYaco: 10, explosivePlays: 2,
      mtf: 6, // combined stays unscored when split rates are used
    };
    const { points } = scoreStatLine(line, rules({
      rushMtf: 1.5, recMtf: 3, yacoYd: 0.1, recYacoYd: 0.2, explosivePlay: 6,
    }));
    // 4*1.5 + 2*3 + 30*0.1 + 10*0.2 + 2*6 = 6 + 6 + 3 + 2 + 12
    expect(points).toBeCloseTo(29, 2);
  });

  it("WR separation grades score per route at each grade, plus rec first downs", () => {
    const line = { sepP1: 4, sepP2: 2, sepM1: 3, sepM2: 1, recFd: 5 };
    const { points } = scoreStatLine(line, rules({
      sepP1: 5, sepP2: 10, sepM1: -5, sepM2: -10, recFirstDown: 2,
    }));
    // 4*5 + 2*10 + 3*-5 + 1*-10 + 5*2 = 20 + 20 - 15 - 10 + 10
    expect(points).toBeCloseTo(25, 2);
  });

  it("TE set: YAC .25, MTF 3, drop -10", () => {
    const line = { recYac: 40, mtf: 2, drops: 1 };
    const { points } = scoreStatLine(line, rules({
      recYacYd: 0.25, missedTackleForced: 3, drop: -10,
    }));
    // 40*0.25 + 2*3 - 10 = 10 + 6 - 10
    expect(points).toBeCloseTo(6, 2);
  });

  it("QB advanced: EPA total ×2.5 vs EPA/dropback ×10", () => {
    const base = SCORING_PRESETS.fp_advanced.qbAdvanced!;
    const line = { epaTotal: 8, dropbacks: 40, passInt: 0 };
    const opts = { position: "QB" };
    const viaTotal = scoreStatLine(line, {
      ...SCORING_PRESETS.fp_advanced,
      qbAdvanced: { ...base, epaPerDropback: 0, epaTotal: 2.5 },
    }, opts);
    expect(viaTotal.points).toBeCloseTo(8 * 2.5, 2); // 20
    const viaRate = scoreStatLine(line, {
      ...SCORING_PRESETS.fp_advanced,
      qbAdvanced: { ...base, epaPerDropback: 10, epaTotal: 0 },
    }, opts);
    expect(viaRate.points).toBeCloseTo((8 / 40) * 10, 2); // 2
  });
});
