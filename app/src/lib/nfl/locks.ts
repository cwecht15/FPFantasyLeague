/**
 * Weekly data lock: a regular-season week's results become FINAL at noon
 * (America/New_York) on the Thursday after its last kickoff — i.e. before the
 * next week's TNF. After that moment the app refuses to re-score or re-roll
 * the week, and the pipeline refuses to overwrite its stat lines.
 */

import { and, eq, max } from "drizzle-orm";

import { db } from "@/lib/db";
import { nflGames } from "@/lib/db/schema";

/** UTC instant of 12:00 noon America/New_York on the given calendar date. */
function etNoonUtc(year: number, monthIndex: number, day: number): Date {
  // Guess EDT (UTC-4), then correct via Intl if the date is actually EST.
  const guess = new Date(Date.UTC(year, monthIndex, day, 16, 0, 0));
  const etHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).format(guess),
  );
  const correction = 12 - etHour; // 0 in EDT, +1 in EST
  return new Date(guess.getTime() + correction * 3600 * 1000);
}

/** The first Thursday 12:00 ET strictly after `after`. */
export function nextThursdayNoonEt(after: Date): Date {
  for (let d = 0; d <= 8; d++) {
    const probe = new Date(after.getTime() + d * 24 * 3600 * 1000);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).formatToParts(probe);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    if (get("weekday") !== "Thu") continue;
    const candidate = etNoonUtc(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
    if (candidate.getTime() > after.getTime()) return candidate;
  }
  // unreachable; defensive fallback one week out
  return new Date(after.getTime() + 7 * 24 * 3600 * 1000);
}

/** When the week's data locks (null if no kickoffs known yet). */
export async function weekLockTime(season: number, week: number): Promise<Date | null> {
  const [row] = await db
    .select({ lastKick: max(nflGames.kickoffAt) })
    .from(nflGames)
    .where(
      and(eq(nflGames.season, season), eq(nflGames.seasonType, "REG"), eq(nflGames.week, week)),
    );
  if (!row?.lastKick) return null;
  return nextThursdayNoonEt(row.lastKick);
}

export async function isWeekDataLocked(season: number, week: number): Promise<boolean> {
  const lockAt = await weekLockTime(season, week);
  return lockAt !== null && Date.now() >= lockAt.getTime();
}
