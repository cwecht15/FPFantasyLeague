ALTER TABLE "player_week_stats" ADD COLUMN "accurate_throws" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "to_worthy_throws" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "hero_throws" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "pass_air_yds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "hero_catches" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "drops" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "rec_air_yds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "rec_yac" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player_week_stats" ADD COLUMN "mtf" integer DEFAULT 0 NOT NULL;