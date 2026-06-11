CREATE TABLE "championship_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"season" integer NOT NULL,
	"league_id" bigint NOT NULL,
	"team_id" bigint NOT NULL,
	"seed" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "championship_entries" ADD CONSTRAINT "championship_entries_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_entries" ADD CONSTRAINT "championship_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "championship_entries_team_unique" ON "championship_entries" USING btree ("season","team_id");--> statement-breakpoint
CREATE INDEX "championship_entries_season_idx" ON "championship_entries" USING btree ("season");