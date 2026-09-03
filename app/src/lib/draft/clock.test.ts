import { describe, expect, it } from "vitest";

import { clockDeadline, quietWindowFrom, quietWindowLabel } from "./clock";

// 2026-09-03 is EDT (UTC-4): 18:00 UTC = 2 PM ET.
const at = (iso: string) => new Date(iso);
const QUIET = { startHourEt: 0, endHourEt: 10 }; // midnight-10AM ET

describe("clockDeadline", () => {
  it("is a plain offset with no quiet window", () => {
    const d = clockDeadline(at("2026-09-03T18:00:00Z"), 4 * 3600, null);
    expect(d.toISOString()).toBe("2026-09-03T22:00:00.000Z");
  });

  it("runs untouched when the window ends before quiet starts", () => {
    // 2 PM ET + 4h = 6 PM ET, well before midnight.
    const d = clockDeadline(at("2026-09-03T18:00:00Z"), 4 * 3600, QUIET);
    expect(d.toISOString()).toBe("2026-09-03T22:00:00.000Z");
  });

  it("pauses overnight and resumes at 10 AM ET", () => {
    // 11 PM ET (03:00 UTC) + 4h: 1h runs to midnight, 3h resume at 10 AM ET
    // -> 1 PM ET = 17:00 UTC.
    const d = clockDeadline(at("2026-09-04T03:00:00Z"), 4 * 3600, QUIET);
    expect(d.toISOString()).toBe("2026-09-04T17:00:00.000Z");
  });

  it("starts inside the quiet window at the window's end", () => {
    // 3 AM ET (07:00 UTC) + 4h -> clock starts at 10 AM ET -> 2 PM ET = 18:00 UTC.
    const d = clockDeadline(at("2026-09-04T07:00:00Z"), 4 * 3600, QUIET);
    expect(d.toISOString()).toBe("2026-09-04T18:00:00.000Z");
  });

  it("spans multiple nights for long clocks", () => {
    // 8 PM ET Thu (00:00 UTC Fri) + 24h active: 4h to midnight, 14h Fri
    // (10AM-midnight), 6h Sat from 10 AM -> Sat 4 PM ET = 20:00 UTC.
    const d = clockDeadline(at("2026-09-04T00:00:00Z"), 24 * 3600, QUIET);
    expect(d.toISOString()).toBe("2026-09-05T20:00:00.000Z");
  });

  it("handles a window that wraps midnight (22 -> 8)", () => {
    const wrap = { startHourEt: 22, endHourEt: 8 };
    // 9 PM ET (01:00 UTC) + 2h: 1h to 10 PM, 1h resumes 8 AM -> 9 AM ET = 13:00 UTC.
    const d = clockDeadline(at("2026-09-04T01:00:00Z"), 2 * 3600, wrap);
    expect(d.toISOString()).toBe("2026-09-04T13:00:00.000Z");
  });
});

describe("quietWindowFrom", () => {
  it("returns null when unset or degenerate", () => {
    expect(quietWindowFrom({})).toBeNull();
    expect(quietWindowFrom({ clockQuietStartHourEt: 5, clockQuietEndHourEt: 5 })).toBeNull();
    expect(quietWindowFrom({ clockQuietStartHourEt: 0 })).toBeNull();
  });
  it("builds the window", () => {
    expect(quietWindowFrom({ clockQuietStartHourEt: 0, clockQuietEndHourEt: 10 })).toEqual({
      startHourEt: 0,
      endHourEt: 10,
    });
  });
});

describe("quietWindowLabel", () => {
  it("formats hours", () => {
    expect(quietWindowLabel({ startHourEt: 0, endHourEt: 10 })).toBe("12 AM–10 AM ET");
    expect(quietWindowLabel({ startHourEt: 22, endHourEt: 8 })).toBe("10 PM–8 AM ET");
  });
});
