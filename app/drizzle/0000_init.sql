CREATE TYPE "public"."acquired_via" AS ENUM('draft', 'waiver', 'free_agent', 'trade');--> statement-breakpoint
CREATE TYPE "public"."draft_status" AS ENUM('pending', 'in_progress', 'paused', 'complete');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."league_status" AS ENUM('setup', 'drafting', 'in_season', 'playoffs', 'complete');--> statement-breakpoint
CREATE TYPE "public"."matchup_status" AS ENUM('scheduled', 'in_progress', 'final');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('commissioner', 'manager', 'co_manager', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('email', 'in_app');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('your_turn', 'pick_made', 'trade_offer', 'waiver_result', 'matchup_result');--> statement-breakpoint
CREATE TYPE "public"."trade_asset" AS ENUM('player', 'draft_pick', 'faab');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('proposed', 'accepted', 'rejected', 'commish_review', 'approved', 'applied', 'vetoed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('pending', 'applied', 'rejected', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."tx_type" AS ENUM('add', 'drop', 'add_drop', 'waiver', 'trade', 'draft');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TYPE "public"."waiver_status" AS ENUM('pending', 'won', 'lost', 'invalid');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "draft_picks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"draft_id" bigint NOT NULL,
	"overall_pick" integer NOT NULL,
	"round" integer NOT NULL,
	"pick_in_round" integer NOT NULL,
	"team_id" bigint NOT NULL,
	"gsis_id" text,
	"picked_by_user_id" text,
	"picked_at" timestamp with time zone,
	"is_autopick" boolean DEFAULT false NOT NULL,
	"clock_started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "draft_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"draft_id" bigint NOT NULL,
	"team_id" bigint NOT NULL,
	"gsis_id" text NOT NULL,
	"rank" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" bigint NOT NULL,
	"status" "draft_status" DEFAULT 'pending' NOT NULL,
	"seconds_per_pick" integer NOT NULL,
	"current_pick_id" bigint,
	"paused_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_members" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'manager' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "league_settings" (
	"league_id" bigint PRIMARY KEY NOT NULL,
	"roster_template" jsonb NOT NULL,
	"scoring_rules" jsonb NOT NULL,
	"draft_config" jsonb NOT NULL,
	"waiver_config" jsonb NOT NULL,
	"playoff_config" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"season" integer NOT NULL,
	"commissioner_user_id" text NOT NULL,
	"status" "league_status" DEFAULT 'setup' NOT NULL,
	"num_teams" integer DEFAULT 12 NOT NULL,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"invite_code" text NOT NULL,
	"parent_league_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineup_slots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"lineup_id" bigint NOT NULL,
	"slot" text NOT NULL,
	"slot_index" integer NOT NULL,
	"gsis_id" text,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lineups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" bigint NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" bigint NOT NULL,
	"season" integer NOT NULL,
	"week" integer NOT NULL,
	"home_team_id" bigint NOT NULL,
	"away_team_id" bigint,
	"home_points" double precision,
	"away_points" double precision,
	"winner_team_id" bigint,
	"is_tie" boolean DEFAULT false NOT NULL,
	"is_playoff" boolean DEFAULT false NOT NULL,
	"playoff_round" integer,
	"status" "matchup_status" DEFAULT 'scheduled' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nfl_games" (
	"game_id" text PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"season_type" text NOT NULL,
	"week" integer NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"kickoff_at" timestamp with time zone,
	"home_score" integer,
	"away_score" integer,
	"status" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"league_id" bigint,
	"type" "notification_type" NOT NULL,
	"channel" "notification_channel" DEFAULT 'in_app' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_week_games" (
	"gsis_id" text NOT NULL,
	"season" integer NOT NULL,
	"season_type" text NOT NULL,
	"week" integer NOT NULL,
	"game_id" text NOT NULL,
	"team" text,
	CONSTRAINT "player_week_games_gsis_id_season_season_type_week_pk" PRIMARY KEY("gsis_id","season","season_type","week")
);
--> statement-breakpoint
CREATE TABLE "player_week_scores" (
	"league_id" bigint NOT NULL,
	"gsis_id" text NOT NULL,
	"season" integer NOT NULL,
	"season_type" text NOT NULL,
	"week" integer NOT NULL,
	"fantasy_points" double precision NOT NULL,
	"breakdown" jsonb,
	"scoring_version" integer NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_week_scores_league_id_gsis_id_season_season_type_week_pk" PRIMARY KEY("league_id","gsis_id","season","season_type","week")
);
--> statement-breakpoint
CREATE TABLE "player_week_stats" (
	"gsis_id" text NOT NULL,
	"season" integer NOT NULL,
	"season_type" text NOT NULL,
	"week" integer NOT NULL,
	"team" text,
	"pass_yds" integer DEFAULT 0 NOT NULL,
	"pass_td" integer DEFAULT 0 NOT NULL,
	"pass_int" integer DEFAULT 0 NOT NULL,
	"pass_2pt" integer DEFAULT 0 NOT NULL,
	"rush_yds" integer DEFAULT 0 NOT NULL,
	"rush_td" integer DEFAULT 0 NOT NULL,
	"rush_2pt" integer DEFAULT 0 NOT NULL,
	"receptions" integer DEFAULT 0 NOT NULL,
	"rec_yds" integer DEFAULT 0 NOT NULL,
	"rec_td" integer DEFAULT 0 NOT NULL,
	"rec_2pt" integer DEFAULT 0 NOT NULL,
	"targets" integer DEFAULT 0 NOT NULL,
	"fumbles_lost" integer DEFAULT 0 NOT NULL,
	"fg_made_0_19" integer DEFAULT 0 NOT NULL,
	"fg_made_20_29" integer DEFAULT 0 NOT NULL,
	"fg_made_30_39" integer DEFAULT 0 NOT NULL,
	"fg_made_40_49" integer DEFAULT 0 NOT NULL,
	"fg_made_50_plus" integer DEFAULT 0 NOT NULL,
	"fg_missed" integer DEFAULT 0 NOT NULL,
	"xp_made" integer DEFAULT 0 NOT NULL,
	"dst_sacks" double precision,
	"dst_int" integer,
	"dst_fum_rec" integer,
	"dst_td" integer,
	"dst_safeties" integer,
	"dst_blocks" integer,
	"points_allowed" integer,
	"idp_solo_tackles" integer,
	"idp_assists" integer,
	"idp_sacks" double precision,
	"idp_tfl" integer,
	"idp_pass_def" integer,
	"idp_int" integer,
	"idp_fum_rec" integer,
	"idp_forced_fumbles" integer,
	"idp_def_td" integer,
	"source_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_week_stats_gsis_id_season_season_type_week_pk" PRIMARY KEY("gsis_id","season","season_type","week")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"gsis_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"position" text NOT NULL,
	"nfl_team" text,
	"status" text,
	"headshot_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roster_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" bigint NOT NULL,
	"team_id" bigint NOT NULL,
	"gsis_id" text NOT NULL,
	"acquired_via" "acquired_via" NOT NULL,
	"acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dropped_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "score_dirty" (
	"season" integer NOT NULL,
	"season_type" text NOT NULL,
	"week" integer NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"pushed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "score_dirty_season_season_type_week_pk" PRIMARY KEY("season","season_type","week")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standings" (
	"league_id" bigint NOT NULL,
	"season" integer NOT NULL,
	"team_id" bigint NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"ties" integer DEFAULT 0 NOT NULL,
	"points_for" double precision DEFAULT 0 NOT NULL,
	"points_against" double precision DEFAULT 0 NOT NULL,
	"rank" integer,
	"playoff_seed" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "standings_league_id_season_team_id_pk" PRIMARY KEY("league_id","season","team_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" bigint NOT NULL,
	"owner_user_id" text,
	"name" text NOT NULL,
	"abbrev" text,
	"logo_url" text,
	"draft_position" integer,
	"waiver_priority" integer,
	"faab_budget" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"trade_id" bigint NOT NULL,
	"from_team_id" bigint NOT NULL,
	"to_team_id" bigint NOT NULL,
	"asset_type" "trade_asset" NOT NULL,
	"gsis_id" text,
	"draft_pick_id" bigint,
	"faab_amount" integer
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" bigint NOT NULL,
	"proposing_team_id" bigint NOT NULL,
	"receiving_team_id" bigint NOT NULL,
	"status" "trade_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" bigint NOT NULL,
	"team_id" bigint,
	"type" "tx_type" NOT NULL,
	"add_gsis_id" text,
	"drop_gsis_id" text,
	"status" "tx_status" DEFAULT 'applied' NOT NULL,
	"created_by_user_id" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	"password_hash" text,
	"display_name" text,
	"is_site_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "waiver_claims" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"league_id" bigint NOT NULL,
	"team_id" bigint NOT NULL,
	"add_gsis_id" text NOT NULL,
	"drop_gsis_id" text,
	"bid_amount" integer,
	"priority" integer,
	"status" "waiver_status" DEFAULT 'pending' NOT NULL,
	"process_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_picks" ADD CONSTRAINT "draft_picks_picked_by_user_id_users_id_fk" FOREIGN KEY ("picked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_queue" ADD CONSTRAINT "draft_queue_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_queue" ADD CONSTRAINT "draft_queue_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_settings" ADD CONSTRAINT "league_settings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_commissioner_user_id_users_id_fk" FOREIGN KEY ("commissioner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_slots" ADD CONSTRAINT "lineup_slots_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_home_team_id_teams_id_fk" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_away_team_id_teams_id_fk" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_week_scores" ADD CONSTRAINT "player_week_scores_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standings" ADD CONSTRAINT "standings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_from_team_id_teams_id_fk" FOREIGN KEY ("from_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_to_team_id_teams_id_fk" FOREIGN KEY ("to_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_proposing_team_id_teams_id_fk" FOREIGN KEY ("proposing_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_receiving_team_id_teams_id_fk" FOREIGN KEY ("receiving_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_claims" ADD CONSTRAINT "waiver_claims_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiver_claims" ADD CONSTRAINT "waiver_claims_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_picks_overall_unique" ON "draft_picks" USING btree ("draft_id","overall_pick");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_picks_player_unique" ON "draft_picks" USING btree ("draft_id","gsis_id") WHERE "draft_picks"."gsis_id" is not null;--> statement-breakpoint
CREATE INDEX "draft_picks_open_deadline_idx" ON "draft_picks" USING btree ("deadline_at") WHERE "draft_picks"."picked_at" is null;--> statement-breakpoint
CREATE INDEX "draft_picks_team_idx" ON "draft_picks" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_queue_player_unique" ON "draft_queue" USING btree ("draft_id","team_id","gsis_id");--> statement-breakpoint
CREATE UNIQUE INDEX "draft_queue_rank_unique" ON "draft_queue" USING btree ("draft_id","team_id","rank");--> statement-breakpoint
CREATE INDEX "draft_queue_team_rank_idx" ON "draft_queue" USING btree ("draft_id","team_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "drafts_league_unique" ON "drafts" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "jobs_queued_idx" ON "jobs" USING btree ("run_after") WHERE "jobs"."status" = 'queued';--> statement-breakpoint
CREATE UNIQUE INDEX "league_members_unique" ON "league_members" USING btree ("league_id","user_id");--> statement-breakpoint
CREATE INDEX "league_members_user_idx" ON "league_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_slug_idx" ON "leagues" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "leagues_invite_code_idx" ON "leagues" USING btree ("invite_code");--> statement-breakpoint
CREATE INDEX "leagues_status_idx" ON "leagues" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "lineup_slots_unique" ON "lineup_slots" USING btree ("lineup_id","slot","slot_index");--> statement-breakpoint
CREATE UNIQUE INDEX "lineups_team_week_unique" ON "lineups" USING btree ("team_id","season","week");--> statement-breakpoint
CREATE UNIQUE INDEX "matchups_unique" ON "matchups" USING btree ("league_id","season","week","home_team_id");--> statement-breakpoint
CREATE INDEX "matchups_league_week_idx" ON "matchups" USING btree ("league_id","season","week");--> statement-breakpoint
CREATE INDEX "nfl_games_season_week_idx" ON "nfl_games" USING btree ("season","week");--> statement-breakpoint
CREATE INDEX "nfl_games_kickoff_idx" ON "nfl_games" USING btree ("kickoff_at");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "pwg_game_idx" ON "player_week_games" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "player_week_scores_league_week_idx" ON "player_week_scores" USING btree ("league_id","season","week");--> statement-breakpoint
CREATE INDEX "player_week_stats_season_week_idx" ON "player_week_stats" USING btree ("season","season_type","week");--> statement-breakpoint
CREATE INDEX "players_position_idx" ON "players" USING btree ("position");--> statement-breakpoint
CREATE INDEX "players_team_idx" ON "players" USING btree ("nfl_team");--> statement-breakpoint
CREATE INDEX "players_name_lower_idx" ON "players" USING btree (lower("display_name"));--> statement-breakpoint
CREATE UNIQUE INDEX "roster_entries_active_owner_unique" ON "roster_entries" USING btree ("league_id","gsis_id") WHERE "roster_entries"."dropped_at" is null;--> statement-breakpoint
CREATE INDEX "roster_entries_active_team_idx" ON "roster_entries" USING btree ("team_id") WHERE "roster_entries"."dropped_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "teams_league_owner_unique" ON "teams" USING btree ("league_id","owner_user_id");--> statement-breakpoint
CREATE INDEX "teams_league_idx" ON "teams" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "transactions_league_created_idx" ON "transactions" USING btree ("league_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "waiver_claims_pending_idx" ON "waiver_claims" USING btree ("league_id","process_after") WHERE "waiver_claims"."status" = 'pending';