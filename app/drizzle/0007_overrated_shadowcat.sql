ALTER TABLE "player_week_stats" ADD COLUMN "rec_yaco" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "rec_fd" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "rush_mtf" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "rec_mtf" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "explosive_plays" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "sep_m2" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "sep_m1" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "sep_p1" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "sep_p2" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "sep_p3" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "sep_p4" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "pa_dropbacks" integer;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "motion_dropbacks" integer;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "team_win" integer;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "team_points_scored" integer;