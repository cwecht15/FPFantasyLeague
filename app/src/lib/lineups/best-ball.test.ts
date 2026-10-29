import { describe, expect, it } from "vitest";

import { DEFAULT_ROSTER_TEMPLATE } from "../leagues/settings";

import { bestBallAssignment, type BestBallPlayer } from "./best-ball-assign";

const p = (gsisId: string, position: string, points: number): BestBallPlayer => ({
  gsisId,
  position,
  points,
});

describe("bestBallAssignment", () => {
  it("starts the best legal lineup and puts the best leftover RB/WR/TE at FLEX", () => {
    const roster = [
      p("qb1", "QB", 20),
      p("qb2", "QB", 30),
      p("rb1", "RB", 10),
      p("rb2", "RB", 25),
      p("rb3", "RB", 18),
      p("wr1", "WR", 22),
      p("wr2", "WR", 5),
      p("wr3", "WR", 12),
      p("te1", "TE", 40),
      p("te2", "TE", 15),
      p("c1", "COACH", 7),
      p("c2", "COACH", 3),
    ];
    const a = bestBallAssignment(DEFAULT_ROSTER_TEMPLATE, roster);
    expect(a.get("QB#0")).toBe("qb2");
    expect(new Set([a.get("RB#0"), a.get("RB#1")])).toEqual(new Set(["rb2", "rb3"]));
    expect(new Set([a.get("WR#0"), a.get("WR#1")])).toEqual(new Set(["wr1", "wr3"]));
    expect(a.get("TE#0")).toBe("te1");
    expect(a.get("COACH#0")).toBe("c1");
    // leftovers: te2 15, rb1 10, wr2 5 → FLEX takes te2 (TE is FLEX-eligible)
    expect(a.get("FLEX#0")).toBe("te2");
    const bench = [0, 1, 2, 3].map((i) => a.get(`BENCH#${i}`));
    expect(new Set(bench)).toEqual(new Set(["qb1", "rb1", "wr2", "c2"]));
  });

  it("never puts a QB or COACH at FLEX and leaves a slot empty when nobody is eligible", () => {
    const roster = [p("qb1", "QB", 30), p("qb2", "QB", 25), p("rb1", "RB", 4)];
    const a = bestBallAssignment(DEFAULT_ROSTER_TEMPLATE, roster);
    expect(a.get("QB#0")).toBe("qb1");
    expect(a.get("FLEX#0")).toBeUndefined();
    expect(a.get("RB#0")).toBe("rb1");
    expect(a.get("TE#0")).toBeUndefined();
    expect(a.get("BENCH#0")).toBe("qb2");
  });

  it("still starts a negative-scoring player over leaving the slot empty", () => {
    const a = bestBallAssignment(DEFAULT_ROSTER_TEMPLATE, [p("wr1", "WR", -1.5)]);
    expect(a.get("WR#0")).toBe("wr1");
  });
});
