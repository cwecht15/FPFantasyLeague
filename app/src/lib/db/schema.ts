/**
 * Drizzle schema for the FPFantasyLeague app database (Postgres / Neon).
 *
 * Conventions:
 *  - Auth tables (users/accounts/sessions/verification_tokens) use text UUID PKs
 *    to stay compatible with @auth/drizzle-adapter. Everything else uses
 *    bigserial identity PKs.
 *  - Money/points: integers for FAAB, doublePrecision for fantasy points / PF-PA.
 *  - League config lives as JSONB validated by Zod in lib/leagues/settings.ts.
 *  - The player pool is unified: kickers and IDPs use their gsis_id; team
 *    defenses use synthetic 'DST-XX' gsis_ids, so every roster slot references a
 *    single `players.gsis_id` and scoring treats "everything is a player".
 */

import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { RawStatLine } from "@/lib/scoring/score-stat-line";
import type { ScoringRules } from "@/lib/scoring/scoring-systems";
import type {
  DraftConfig,
  PlayoffConfig,
  RosterTemplate,
  WaiverConfig,
} from "@/lib/leagues/settings";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const leagueStatus = pgEnum("league_status", [
  "setup",
  "drafting",
  "in_season",
  "playoffs",
  "complete",
]);
export const visibility = pgEnum("visibility", ["private", "public"]);
export const memberRole = pgEnum("member_role", [
  "commissioner",
  "manager",
  "co_manager",
  "viewer",
]);
export const draftStatus = pgEnum("draft_status", [
  "pending",
  "in_progress",
  "paused",
  "complete",
]);
export const acquiredVia = pgEnum("acquired_via", [
  "draft",
  "waiver",
  "free_agent",
  "trade",
]);
export const matchupStatus = pgEnum("matchup_status", [
  "scheduled",
  "in_progress",
  "final",
]);
export const txType = pgEnum("tx_type", [
  "add",
  "drop",
  "add_drop",
  "waiver",
  "trade",
  "draft",
]);
export const txStatus = pgEnum("tx_status", [
  "pending",
  "applied",
  "rejected",
  "reverted",
]);
export const waiverStatus = pgEnum("waiver_status", [
  "pending",
  "won",
  "lost",
  "invalid",
]);
export const tradeStatus = pgEnum("trade_status", [
  "proposed",
  "accepted",
  "rejected",
  "commish_review",
  "approved",
  "applied",
  "vetoed",
  "expired",
]);
export const tradeAsset = pgEnum("trade_asset", ["player", "draft_pick", "faab"]);
export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "done",
  "failed",
]);
export const notificationType = pgEnum("notification_type", [
  "your_turn",
  "pick_made",
  "trade_offer",
  "waiver_result",
  "matchup_result",
]);
export const notificationChannel = pgEnum("notification_channel", ["email", "in_app"]);

// ---------------------------------------------------------------------------
// Auth (Auth.js / @auth/drizzle-adapter compatible)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { withTimezone: true }),
  image: text("image"),
  // app-specific
  passwordHash: text("password_hash"), // null for OAuth-only accounts
  displayName: text("display_name"),
  isSiteAdmin: boolean("is_site_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)]);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Player pool & NFL reference (pipeline-owned)
// ---------------------------------------------------------------------------

export const players = pgTable(
  "players",
  {
    gsisId: text("gsis_id").primaryKey(), // '00-NNNNNNN' or synthetic 'DST-KC'
    displayName: text("display_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    position: text("position").notNull(), // QB/RB/WR/TE/K/DST/DL/LB/DB
    nflTeam: text("nfl_team"), // stored as delivered (non-standard codes possible)
    status: text("status"),
    headshotUrl: text("headshot_url"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("players_position_idx").on(t.position),
    index("players_team_idx").on(t.nflTeam),
    index("players_name_lower_idx").on(sql`lower(${t.displayName})`),
  ],
);

export const nflGames = pgTable(
  "nfl_games",
  {
    gameId: text("game_id").primaryKey(), // nflverse '2024_01_KC_BAL'
    season: integer("season").notNull(),
    seasonType: text("season_type").notNull(), // REG | POST
    week: integer("week").notNull(),
    homeTeam: text("home_team").notNull(),
    awayTeam: text("away_team").notNull(),
    kickoffAt: timestamp("kickoff_at", { withTimezone: true }), // null if not finalized
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    status: text("status"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("nfl_games_season_week_idx").on(t.season, t.week),
    index("nfl_games_kickoff_idx").on(t.kickoffAt),
  ],
);

/** Resolver: which game (and team) a player was on in a given week. Lets a
 *  lineup slot find its lock time (nfl_games.kickoff_at). Pipeline-populated. */
export const playerWeekGames = pgTable(
  "player_week_games",
  {
    gsisId: text("gsis_id").notNull(),
    season: integer("season").notNull(),
    seasonType: text("season_type").notNull(),
    week: integer("week").notNull(),
    gameId: text("game_id").notNull(),
    team: text("team"),
  },
  (t) => [
    primaryKey({ columns: [t.gsisId, t.season, t.seasonType, t.week] }),
    index("pwg_game_idx").on(t.gameId),
  ],
);

// ---------------------------------------------------------------------------
// Leagues, membership, teams, settings
// ---------------------------------------------------------------------------

export const leagues = pgTable(
  "leagues",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    season: integer("season").notNull(),
    commissionerUserId: text("commissioner_user_id")
      .notNull()
      .references(() => users.id),
    status: leagueStatus("status").notNull().default("setup"),
    numTeams: integer("num_teams").notNull().default(12),
    visibility: visibility("visibility").notNull().default("private"),
    /** Demo/sandbox leagues are visible to site admins only. */
    isDemo: boolean("is_demo").notNull().default(false),
    inviteCode: text("invite_code").notNull(),
    parentLeagueId: bigint("parent_league_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("leagues_slug_idx").on(t.slug),
    uniqueIndex("leagues_invite_code_idx").on(t.inviteCode),
    index("leagues_status_idx").on(t.status),
  ],
);

export const leagueMembers = pgTable(
  "league_members",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("manager"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("league_members_unique").on(t.leagueId, t.userId),
    index("league_members_user_idx").on(t.userId),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").references(() => users.id),
    name: text("name").notNull(),
    abbrev: text("abbrev"),
    logoUrl: text("logo_url"),
    draftPosition: integer("draft_position"),
    waiverPriority: integer("waiver_priority"),
    faabBudget: integer("faab_budget"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("teams_league_owner_unique").on(t.leagueId, t.ownerUserId),
    index("teams_league_idx").on(t.leagueId),
  ],
);

export const leagueSettings = pgTable("league_settings", {
  leagueId: bigint("league_id", { mode: "number" })
    .primaryKey()
    .references(() => leagues.id, { onDelete: "cascade" }),
  rosterTemplate: jsonb("roster_template").$type<RosterTemplate>().notNull(),
  scoringRules: jsonb("scoring_rules").$type<ScoringRules>().notNull(),
  draftConfig: jsonb("draft_config").$type<DraftConfig>().notNull(),
  waiverConfig: jsonb("waiver_config").$type<WaiverConfig>().notNull(),
  playoffConfig: jsonb("playoff_config").$type<PlayoffConfig>().notNull(),
  /** Bumped on any scoring/roster change so stale player_week_scores are detectable. */
  version: integer("version").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Draft engine
// ---------------------------------------------------------------------------

export const drafts = pgTable(
  "drafts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    status: draftStatus("status").notNull().default("pending"),
    secondsPerPick: integer("seconds_per_pick").notNull(),
    currentPickId: bigint("current_pick_id", { mode: "number" }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("drafts_league_unique").on(t.leagueId)],
);

export const draftPicks = pgTable(
  "draft_picks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    draftId: bigint("draft_id", { mode: "number" })
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    overallPick: integer("overall_pick").notNull(),
    round: integer("round").notNull(),
    pickInRound: integer("pick_in_round").notNull(),
    teamId: bigint("team_id", { mode: "number" })
      .notNull()
      .references(() => teams.id),
    gsisId: text("gsis_id"), // null until picked
    pickedByUserId: text("picked_by_user_id").references(() => users.id),
    pickedAt: timestamp("picked_at", { withTimezone: true }),
    isAutopick: boolean("is_autopick").notNull().default(false),
    clockStartedAt: timestamp("clock_started_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("draft_picks_overall_unique").on(t.draftId, t.overallPick),
    // DB-enforced: a player can be picked at most once per draft.
    uniqueIndex("draft_picks_player_unique")
      .on(t.draftId, t.gsisId)
      .where(sql`${t.gsisId} is not null`),
    // Hot path for the worker clock scan.
    index("draft_picks_open_deadline_idx")
      .on(t.deadlineAt)
      .where(sql`${t.pickedAt} is null`),
    index("draft_picks_team_idx").on(t.teamId),
  ],
);

export const draftQueue = pgTable(
  "draft_queue",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    draftId: bigint("draft_id", { mode: "number" })
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    teamId: bigint("team_id", { mode: "number" })
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    gsisId: text("gsis_id").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [
    uniqueIndex("draft_queue_player_unique").on(t.draftId, t.teamId, t.gsisId),
    uniqueIndex("draft_queue_rank_unique").on(t.draftId, t.teamId, t.rank),
    index("draft_queue_team_rank_idx").on(t.draftId, t.teamId, t.rank),
  ],
);

// ---------------------------------------------------------------------------
// Rosters & lineups
// ---------------------------------------------------------------------------

export const rosterEntries = pgTable(
  "roster_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    teamId: bigint("team_id", { mode: "number" })
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    gsisId: text("gsis_id").notNull(),
    acquiredVia: acquiredVia("acquired_via").notNull(),
    acquiredAt: timestamp("acquired_at", { withTimezone: true }).defaultNow().notNull(),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
  },
  (t) => [
    // DB-enforced: one team owns a given player at a time within a league.
    uniqueIndex("roster_entries_active_owner_unique")
      .on(t.leagueId, t.gsisId)
      .where(sql`${t.droppedAt} is null`),
    index("roster_entries_active_team_idx")
      .on(t.teamId)
      .where(sql`${t.droppedAt} is null`),
  ],
);

export const lineups = pgTable(
  "lineups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: bigint("team_id", { mode: "number" })
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
  },
  (t) => [uniqueIndex("lineups_team_week_unique").on(t.teamId, t.season, t.week)],
);

export const lineupSlots = pgTable(
  "lineup_slots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    lineupId: bigint("lineup_id", { mode: "number" })
      .notNull()
      .references(() => lineups.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(), // QB/RB/WR/TE/FLEX/K/DST/BENCH/IR/...
    slotIndex: integer("slot_index").notNull(),
    gsisId: text("gsis_id"),
    lockedAt: timestamp("locked_at", { withTimezone: true }), // optional audit snapshot
  },
  (t) => [uniqueIndex("lineup_slots_unique").on(t.lineupId, t.slot, t.slotIndex)],
);

// ---------------------------------------------------------------------------
// Schedule & results
// ---------------------------------------------------------------------------

export const matchups = pgTable(
  "matchups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    week: integer("week").notNull(),
    homeTeamId: bigint("home_team_id", { mode: "number" })
      .notNull()
      .references(() => teams.id),
    awayTeamId: bigint("away_team_id", { mode: "number" }).references(() => teams.id), // null = bye
    homePoints: doublePrecision("home_points"),
    awayPoints: doublePrecision("away_points"),
    winnerTeamId: bigint("winner_team_id", { mode: "number" }),
    isTie: boolean("is_tie").notNull().default(false),
    isPlayoff: boolean("is_playoff").notNull().default(false),
    playoffRound: integer("playoff_round"),
    status: matchupStatus("status").notNull().default("scheduled"),
  },
  (t) => [
    uniqueIndex("matchups_unique").on(t.leagueId, t.season, t.week, t.homeTeamId),
    index("matchups_league_week_idx").on(t.leagueId, t.season, t.week),
  ],
);

export const standings = pgTable(
  "standings",
  {
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    teamId: bigint("team_id", { mode: "number" })
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    ties: integer("ties").notNull().default(0),
    pointsFor: doublePrecision("points_for").notNull().default(0),
    pointsAgainst: doublePrecision("points_against").notNull().default(0),
    rank: integer("rank"),
    playoffSeed: integer("playoff_seed"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.season, t.teamId] })],
);

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/** INBOUND raw stat lines, pushed weekly by the local pipeline. Typed columns
 *  (not JSONB) because the set is stable and queried. One row per player-week;
 *  DST/COACH rows use synthetic 'DST-XX' / 'COACH-XX' gsis_ids. Mirrors RawStatLine. */
export const playerWeekStats = pgTable(
  "player_week_stats",
  {
    gsisId: text("gsis_id").notNull(),
    season: integer("season").notNull(),
    seasonType: text("season_type").notNull(),
    week: integer("week").notNull(),
    team: text("team"),
    // offense
    passYds: integer("pass_yds").notNull().default(0),
    passTd: integer("pass_td").notNull().default(0),
    passInt: integer("pass_int").notNull().default(0),
    pass2pt: integer("pass_2pt").notNull().default(0),
    rushYds: integer("rush_yds").notNull().default(0),
    rushTd: integer("rush_td").notNull().default(0),
    rush2pt: integer("rush_2pt").notNull().default(0),
    receptions: integer("receptions").notNull().default(0),
    recYds: integer("rec_yds").notNull().default(0),
    recTd: integer("rec_td").notNull().default(0),
    rec2pt: integer("rec_2pt").notNull().default(0),
    targets: integer("targets").notNull().default(0),
    fumblesLost: integer("fumbles_lost").notNull().default(0),
    // advanced charting (FantasyPoints data: pass/base tables)
    accurateThrows: integer("accurate_throws").notNull().default(0), // acc in ACC/BOD/AWY
    catchableThrows: integer("catchable_throws").notNull().default(0), // charted catchable flag
    toWorthyThrows: integer("to_worthy_throws").notNull().default(0),
    heroThrows: integer("hero_throws").notNull().default(0), // wow_throw
    passAirYds: integer("pass_air_yds").notNull().default(0),
    heroCatches: integer("hero_catches").notNull().default(0), // highlight_catch
    drops: integer("drops").notNull().default(0), // inc_type = DP
    recAirYds: integer("rec_air_yds").notNull().default(0), // air yards on targets
    recYac: integer("rec_yac").notNull().default(0), // yards after catch on receptions
    recYaco: integer("rec_yaco").notNull().default(0), // yards after contact on receptions
    recFd: integer("rec_fd").notNull().default(0), // receiving first downs
    mtf: integer("mtf").notNull().default(0), // missed tackles forced (rush + rec)
    rushMtf: integer("rush_mtf").notNull().default(0), // MTF as a rusher
    recMtf: integer("rec_mtf").notNull().default(0), // MTF on catch-and-run
    explosivePlays: integer("explosive_plays").notNull().default(0), // 15+ yd rushes + receptions
    // QB advanced-mode inputs (5+ air-yard filter, sacks, EPA per dropback)
    passYds5p: integer("pass_yds_5p").notNull().default(0), // pass yds on 5+ air-yard throws
    passTd5p: integer("pass_td_5p").notNull().default(0),
    passFd5p: integer("pass_fd_5p").notNull().default(0), // passing first downs, 5+ air yards
    sacksTaken: integer("sacks_taken").notNull().default(0),
    dropbacks: integer("dropbacks").notNull().default(0),
    epaTotal: doublePrecision("epa_total").notNull().default(0), // EPA summed over dropbacks
    // route running
    routes: integer("routes").notNull().default(0),
    sepTotal: integer("sep_total").notNull().default(0), // sum of per-route separation (-2..+4)
    // routes at each separation grade (0/neutral omitted — it scores nothing)
    sepM2: integer("sep_m2").notNull().default(0), // -2 pressed at line
    sepM1: integer("sep_m1").notNull().default(0), // -1 tight
    sepP1: integer("sep_p1").notNull().default(0), // +1 step
    sepP2: integer("sep_p2").notNull().default(0), // +2 open
    sepP3: integer("sep_p3").notNull().default(0), // +3 wide open
    sepP4: integer("sep_p4").notNull().default(0), // +4 coverage bust
    // rushing detail
    rushStuffs: integer("rush_stuffs").notNull().default(0), // carries <= 0 yds (excl. kneels)
    rushYbc: integer("rush_ybc").notNull().default(0), // yards before contact
    rushYaco: integer("rush_yaco").notNull().default(0), // yards after contact
    // kicker
    fgMade0_19: integer("fg_made_0_19").notNull().default(0),
    fgMade20_29: integer("fg_made_20_29").notNull().default(0),
    fgMade30_39: integer("fg_made_30_39").notNull().default(0),
    fgMade40_49: integer("fg_made_40_49").notNull().default(0),
    fgMade50plus: integer("fg_made_50_plus").notNull().default(0),
    fgMissed: integer("fg_missed").notNull().default(0),
    xpMade: integer("xp_made").notNull().default(0),
    // team defense (only set on DST rows)
    dstSacks: doublePrecision("dst_sacks"),
    dstInt: integer("dst_int"),
    dstFumRec: integer("dst_fum_rec"),
    dstTd: integer("dst_td"),
    dstSafeties: integer("dst_safeties"),
    dstBlocks: integer("dst_blocks"),
    pointsAllowed: integer("points_allowed"),
    // team coaching staff (only set on COACH rows — NULL on player rows so
    // team-level scoring never leaks onto individuals)
    paDropbacks: integer("pa_dropbacks"), // play-action dropbacks
    motionDropbacks: integer("motion_dropbacks"), // dropbacks with pre/at-snap motion
    fourthDownAttempts: integer("fourth_down_attempts"), // 4th-down go-for-it snaps (pass/run, no kneels)
    teamWin: integer("team_win"), // 1 = won, 0 = lost/tied, NULL = not final
    teamPointsScored: integer("team_points_scored"), // offense's final score
    // IDP (only set on defender rows)
    idpSoloTackles: integer("idp_solo_tackles"),
    idpAssists: integer("idp_assists"),
    idpSacks: doublePrecision("idp_sacks"),
    idpTfl: integer("idp_tfl"),
    idpPassDef: integer("idp_pass_def"),
    idpInt: integer("idp_int"),
    idpFumRec: integer("idp_fum_rec"),
    idpForcedFumbles: integer("idp_forced_fumbles"),
    idpDefTd: integer("idp_def_td"),
    // provenance
    sourceHash: text("source_hash"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.gsisId, t.season, t.seasonType, t.week] }),
    index("player_week_stats_season_week_idx").on(t.season, t.seasonType, t.week),
  ],
);

/** COMPUTED per-league points. Idempotent UPSERT keyed on the natural key. */
export const playerWeekScores = pgTable(
  "player_week_scores",
  {
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    gsisId: text("gsis_id").notNull(),
    season: integer("season").notNull(),
    seasonType: text("season_type").notNull(),
    week: integer("week").notNull(),
    fantasyPoints: doublePrecision("fantasy_points").notNull(),
    breakdown: jsonb("breakdown").$type<Record<string, number>>(),
    scoringVersion: integer("scoring_version").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.leagueId, t.gsisId, t.season, t.seasonType, t.week] }),
    index("player_week_scores_league_week_idx").on(t.leagueId, t.season, t.week),
  ],
);

/** Pipeline → app signal: which (season, week) slices changed and need rescoring. */
export const scoreDirty = pgTable(
  "score_dirty",
  {
    season: integer("season").notNull(),
    seasonType: text("season_type").notNull(),
    week: integer("week").notNull(),
    changedCount: integer("changed_count").notNull().default(0),
    pushedAt: timestamp("pushed_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.season, t.seasonType, t.week] })],
);

// ---------------------------------------------------------------------------
// Transactions, waivers, trades
// ---------------------------------------------------------------------------

export const transactions = pgTable(
  "transactions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    teamId: bigint("team_id", { mode: "number" }).references(() => teams.id),
    type: txType("type").notNull(),
    addGsisId: text("add_gsis_id"),
    dropGsisId: text("drop_gsis_id"),
    status: txStatus("status").notNull().default("applied"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("transactions_league_created_idx").on(t.leagueId, t.createdAt)],
);

export const waiverClaims = pgTable(
  "waiver_claims",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    teamId: bigint("team_id", { mode: "number" })
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    addGsisId: text("add_gsis_id").notNull(),
    dropGsisId: text("drop_gsis_id"),
    bidAmount: integer("bid_amount"),
    priority: integer("priority"),
    status: waiverStatus("status").notNull().default("pending"),
    processAfter: timestamp("process_after", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    index("waiver_claims_pending_idx")
      .on(t.leagueId, t.processAfter)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const trades = pgTable("trades", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  leagueId: bigint("league_id", { mode: "number" })
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  proposingTeamId: bigint("proposing_team_id", { mode: "number" })
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  receivingTeamId: bigint("receiving_team_id", { mode: "number" })
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  status: tradeStatus("status").notNull().default("proposed"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const tradeItems = pgTable("trade_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  tradeId: bigint("trade_id", { mode: "number" })
    .notNull()
    .references(() => trades.id, { onDelete: "cascade" }),
  fromTeamId: bigint("from_team_id", { mode: "number" })
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  toTeamId: bigint("to_team_id", { mode: "number" })
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  assetType: tradeAsset("asset_type").notNull(),
  gsisId: text("gsis_id"),
  draftPickId: bigint("draft_pick_id", { mode: "number" }),
  faabAmount: integer("faab_amount"),
});

// ---------------------------------------------------------------------------
// Saved scoring sets (admin Scoring Lab)
// ---------------------------------------------------------------------------

/** Named scoring configurations the admin saves from the Lab to revisit and
 *  compare. Independent of any league until applied via league settings. */
export const scoringSets = pgTable(
  "scoring_sets",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    name: text("name").notNull(),
    rules: jsonb("rules").$type<ScoringRules>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("scoring_sets_name_unique").on(t.name)],
);

// ---------------------------------------------------------------------------
// Championship sprint (cross-league playoffs)
// ---------------------------------------------------------------------------

/** Qualifiers for the global championship pool: top teams from EVERY league
 *  enter one field; weeks 15-17 cumulative starter points decide the champion.
 *  Locked by a site admin once week-14 results are final. */
export const championshipEntries = pgTable(
  "championship_entries",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    season: integer("season").notNull(),
    leagueId: bigint("league_id", { mode: "number" })
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    teamId: bigint("team_id", { mode: "number" })
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    seed: integer("seed").notNull(), // rank within their league at qualification
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("championship_entries_team_unique").on(t.season, t.teamId),
    index("championship_entries_season_idx").on(t.season),
  ],
);

// ---------------------------------------------------------------------------
// Worker infra: jobs + notifications
// ---------------------------------------------------------------------------

export const jobs = pgTable(
  "jobs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    type: text("type").notNull(), // draft_advance | score_week | rollup_matchups | process_waivers | send_email
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("jobs_queued_idx")
      .on(t.runAfter)
      .where(sql`${t.status} = 'queued'`),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    leagueId: bigint("league_id", { mode: "number" }).references(() => leagues.id, {
      onDelete: "cascade",
    }),
    type: notificationType("type").notNull(),
    channel: notificationChannel("channel").notNull().default("in_app"),
    title: text("title").notNull(),
    body: text("body"),
    readAt: timestamp("read_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

// Re-export so consumers can import the RawStatLine shape alongside the table.
export type { RawStatLine };
