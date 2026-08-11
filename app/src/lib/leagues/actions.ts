"use server";

/**
 * League server actions: create, join, and commissioner settings updates.
 * Every action re-derives authorization from the session â€” never from form data.
 */

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { leagues, leagueSettings, teams } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import {
  createLeague,
  getLeagueBySlug,
  getMyTeam,
  joinLeague,
} from "@/lib/leagues/service";
import {
  draftConfigSchema,
  playoffConfigSchema,
  rosterTemplateSchema,
  scoringRulesSchema,
  waiverConfigSchema,
} from "@/lib/leagues/settings";
import { getScoringPreset, type ScoringRules } from "@/lib/scoring/scoring-systems";
import { enqueue } from "@/lib/jobs/queue";

export interface FormState {
  error: string | null;
}

const CURRENT_SEASON = Number(process.env.CURRENT_SEASON ?? new Date().getFullYear());

// ---------------------------------------------------------------------------
// Create / join
// ---------------------------------------------------------------------------

// House format: 12-team leagues on the FP Advanced preset by default.
// teamName optional — admin-created leagues don't enroll the admin as a team.
const createSchema = z.object({
  name: z.string().trim().min(3, "League name must be at least 3 characters").max(60),
  teamName: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  numTeams: z.coerce.number().int().min(4).max(20).default(12),
  scoringPreset: z.string().default("fp_advanced"),
});

export async function createLeagueAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  if (!user.isSiteAdmin) return { error: "Only site admins can create leagues" };
  // The admin create form has no teamName input; FormData.get returns null for
  // absent fields and z.optional() only accepts undefined — normalize.
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    teamName: formData.get("teamName") ?? undefined,
    numTeams: formData.get("numTeams") ?? undefined,
    scoringPreset: formData.get("scoringPreset") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  // "set:<id>" selects a saved Scoring Lab set as the league's full rule set;
  // plain values are built-in preset keys.
  let scoringPreset = parsed.data.scoringPreset;
  let scoringRules: ScoringRules | undefined;
  if (scoringPreset.startsWith("set:")) {
    const { scoringSets } = await import("@/lib/db/schema");
    const [set] = await db
      .select()
      .from(scoringSets)
      .where(eq(scoringSets.id, Number(scoringPreset.slice(4))))
      .limit(1);
    if (!set) return { error: "Scoring set not found" };
    scoringRules = set.rules;
    scoringPreset = "fp_advanced"; // base for non-scoring settings (roster etc.)
  }

  const league = await createLeague({
    name: parsed.data.name,
    season: CURRENT_SEASON,
    numTeams: parsed.data.numTeams,
    scoringPreset,
    scoringRules,
    teamName: parsed.data.teamName,
    commissionerUserId: user.id,
  });
  redirect(`/leagues/${league.slug}`);
}

const joinSchema = z.object({
  inviteCode: z.string().trim().min(4).max(40),
  teamName: z.string().trim().min(2, "Team name must be at least 2 characters").max(40),
});

export async function joinLeagueAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const parsed = joinSchema.safeParse({
    inviteCode: formData.get("inviteCode"),
    teamName: formData.get("teamName"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await joinLeague({
    inviteCode: parsed.data.inviteCode,
    teamName: parsed.data.teamName,
    userId: user.id,
  });
  if (result.error || !result.league) return { error: result.error ?? "Could not join" };
  redirect(`/leagues/${result.league.slug}`);
}

// ---------------------------------------------------------------------------
// Admin: settings (leagues are administered centrally by site admins â€”
// there are no per-league commissioners)
// ---------------------------------------------------------------------------

async function requireAdmin(slug: string) {
  const user = await requireUser();
  if (!user.isSiteAdmin) throw new Error("Site admin only");
  const league = await getLeagueBySlug(slug);
  if (!league) throw new Error("League not found");
  return { user, league };
}

/** Replace scoring rules from the field-group form (same inputs as the Lab). */
export async function updateScoringAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const { league } = await requireAdmin(slug);

  const { rulesFromForm } = await import("@/lib/scoring/lab-form");
  const rules = rulesFromForm(formData);
  const validated = scoringRulesSchema.safeParse(rules);
  if (!validated.success) {
    return { error: `Invalid scoring rules: ${validated.error.issues[0]?.message}` };
  }

  await db
    .update(leagueSettings)
    .set({
      scoringRules: rules,
      version: sql`${leagueSettings.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(leagueSettings.leagueId, league.id));

  // Rules changed → re-score every pushed week for this league.
  await enqueue("score_week", { season: league.season, leagueIds: [league.id] });

  revalidatePath(`/leagues/${slug}/settings`);
  return { error: null };
}

const slotCountsSchema = z.record(z.string(), z.coerce.number().int().min(0).max(20));

export async function updateRosterAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const { league } = await requireAdmin(slug);

  const counts: Record<string, number> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("slot_")) counts[key.slice(5)] = Number(value);
  }
  const parsedCounts = slotCountsSchema.safeParse(counts);
  if (!parsedCounts.success) return { error: "Invalid slot counts" };

  const slots = Object.entries(parsedCounts.data)
    .filter(([, count]) => count > 0)
    .map(([slot, count]) => ({ slot, count }));
  const template = rosterTemplateSchema.safeParse({ slots });
  if (!template.success) {
    return { error: `Invalid roster: ${template.error.issues[0]?.message}` };
  }

  await db
    .update(leagueSettings)
    .set({
      rosterTemplate: template.data,
      version: sql`${leagueSettings.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(leagueSettings.leagueId, league.id));

  // Starter layout changed → matchup totals change; re-score triggers rollups.
  await enqueue("score_week", { season: league.season, leagueIds: [league.id] });

  revalidatePath(`/leagues/${slug}/settings`);
  return { error: null };
}

export async function updateConfigsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const { league } = await requireAdmin(slug);

  const draft = draftConfigSchema.safeParse({
    type: "snake",
    secondsPerPick: Number(formData.get("secondsPerPick")),
    orderMode: formData.get("orderMode"),
    thirdRoundReversal: formData.get("thirdRoundReversal") === "on",
    rounds: Number(formData.get("rounds")),
  });
  if (!draft.success) return { error: `Draft config: ${draft.error.issues[0]?.message}` };

  const waiver = waiverConfigSchema.safeParse({
    mode: formData.get("waiverMode"),
    processDow: Number(formData.get("processDow")),
    processHourUtc: Number(formData.get("processHourUtc")),
    faabBudget: Number(formData.get("faabBudget")),
  });
  if (!waiver.success) return { error: `Waiver config: ${waiver.error.issues[0]?.message}` };

  const playoff = playoffConfigSchema.safeParse({
    mode: formData.get("playoffMode") ?? undefined,
    teams: Number(formData.get("playoffTeams")),
    startWeek: Number(formData.get("playoffStartWeek")),
    weeksPerRound: Number(formData.get("weeksPerRound")),
  });
  if (!playoff.success) return { error: `Playoff config: ${playoff.error.issues[0]?.message}` };

  await db
    .update(leagueSettings)
    .set({
      draftConfig: draft.data,
      waiverConfig: waiver.data,
      playoffConfig: playoff.data,
      version: sql`${leagueSettings.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(leagueSettings.leagueId, league.id));

  revalidatePath(`/leagues/${slug}/settings`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Admin: assign a registered user to this league
// ---------------------------------------------------------------------------

export async function assignUserAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const { league } = await requireAdmin(slug);

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Email required" };
  const teamName = String(formData.get("teamName") ?? "").trim() || undefined;

  const { assignUserToLeague } = await import("@/lib/leagues/service");
  const result = await assignUserToLeague({ leagueId: league.id, email, teamName });
  if (result.error) return { error: result.error };

  revalidatePath(`/leagues/${slug}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Admin: schedule generation
// ---------------------------------------------------------------------------

export async function generateScheduleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const slug = String(formData.get("slug") ?? "");
  const { league } = await requireAdmin(slug);

  const { getSettings } = await import("@/lib/leagues/service");
  const { generateSchedule } = await import("@/lib/matchups/schedule");
  const settings = await getSettings(league.id);
  const lastWeek = Math.max(1, settings.playoffConfig.startWeek - 1);

  try {
    await generateSchedule(league.id, league.season, lastWeek);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Schedule generation failed" };
  }

  // Fill in points/standings for any already-pushed weeks.
  await enqueue("score_week", { season: league.season, leagueIds: [league.id] });

  revalidatePath(`/leagues/${slug}`);
  return { error: null };
}

// ---------------------------------------------------------------------------
// Team rename (any manager, own team)
// ---------------------------------------------------------------------------

export async function renameTeamAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();
  const slug = String(formData.get("slug") ?? "");
  const name = String(formData.get("teamName") ?? "").trim();
  if (name.length < 2 || name.length > 40) return { error: "Team name must be 2-40 characters" };

  const league = await getLeagueBySlug(slug);
  if (!league) return { error: "League not found" };
  const team = await getMyTeam(league.id, user.id);
  if (!team) return { error: "You don't have a team in this league" };

  await db.update(teams).set({ name }).where(eq(teams.id, team.id));
  revalidatePath(`/leagues/${slug}`);
  return { error: null };
}
