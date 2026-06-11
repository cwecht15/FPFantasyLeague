ALTER TABLE "player_week_stats" ADD COLUMN "pass_yds_5p" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "pass_td_5p" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "pass_fd_5p" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "sacks_taken" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "dropbacks" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "epa_total" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "routes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "sep_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "rush_stuffs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "rush_ybc" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "rush_yaco" integer DEFAULT 0 NOT NULL;