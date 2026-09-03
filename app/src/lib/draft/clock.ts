/**
 * Pick-clock deadline math with an overnight quiet window (Eastern time).
 * Time on the clock only elapses OUTSIDE the window, so a 4-hour pick that
 * starts at 11 PM ET with a midnight–10 AM window is due at 1 PM tomorrow:
 * one hour runs tonight, the remaining three resume at 10 AM.
 *
 * The window is stored on the league's draftConfig (clockQuietStartHourEt /
 * clockQuietEndHourEt, whole hours 0-23); absent = the clock runs 24/7.
 * DST note: hours are read via the America/New_York calendar, so the window
 * tracks wall-clock ET year-round (the one transition night a year is off by
 * at most an hour — irrelevant at this granularity).
 */

export interface QuietWindow {
  /** ET hour the clock STOPS (e.g. 0 = midnight). */
  startHourEt: number;
  /** ET hour the clock RESUMES (e.g. 10 = 10 AM). */
  endHourEt: number;
}

const ET = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  hour12: false,
});

/** Seconds since midnight, ET wall clock. */
function etSecondsOfDay(d: Date): number {
  const parts = ET.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
}

/** Seconds until the ET wall clock next reads `hour`:00 (0 if just passed → full day). */
function secondsUntilEtHour(d: Date, hour: number): number {
  const diff = (hour * 3600 - etSecondsOfDay(d) + 86400) % 86400;
  return diff === 0 ? 86400 : diff;
}

function inQuiet(d: Date, q: QuietWindow): boolean {
  const sod = etSecondsOfDay(d);
  const start = q.startHourEt * 3600;
  const end = q.endHourEt * 3600;
  return start < end ? sod >= start && sod < end : sod >= start || sod < end;
}

export function quietWindowFrom(config: {
  clockQuietStartHourEt?: number | null;
  clockQuietEndHourEt?: number | null;
}): QuietWindow | null {
  const s = config.clockQuietStartHourEt;
  const e = config.clockQuietEndHourEt;
  if (typeof s !== "number" || typeof e !== "number" || s === e) return null;
  return { startHourEt: s, endHourEt: e };
}

/** The deadline `seconds` of ACTIVE clock after `from` — quiet hours don't count. */
export function clockDeadline(from: Date, seconds: number, quiet: QuietWindow | null): Date {
  if (!quiet) return new Date(from.getTime() + seconds * 1000);
  let t = from.getTime();
  let remaining = seconds;
  // Each iteration either consumes active time or jumps a quiet window; a
  // multi-day clock is bounded well under this.
  for (let guard = 0; remaining > 0 && guard < 400; guard++) {
    const now = new Date(t);
    if (inQuiet(now, quiet)) {
      t += secondsUntilEtHour(now, quiet.endHourEt) * 1000;
      continue;
    }
    const untilQuiet = secondsUntilEtHour(now, quiet.startHourEt);
    const step = Math.min(remaining, untilQuiet);
    t += step * 1000;
    remaining -= step;
  }
  return new Date(t);
}

/** Short human label for the window, e.g. "12 AM–10 AM ET". */
export function quietWindowLabel(q: QuietWindow): string {
  const h = (n: number) => {
    const ampm = n < 12 ? "AM" : "PM";
    const v = n % 12 === 0 ? 12 : n % 12;
    return `${v} ${ampm}`;
  };
  return `${h(q.startHourEt)}–${h(q.endHourEt)} ET`;
}
