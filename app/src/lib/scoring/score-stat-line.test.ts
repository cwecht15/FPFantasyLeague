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
