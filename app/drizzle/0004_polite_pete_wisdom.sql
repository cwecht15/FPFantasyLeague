ALTER TABLE "trade_items" DROP CONSTRAINT "trade_items_from_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "trade_items" DROP CONSTRAINT "trade_items_to_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "trades" DROP CONSTRAINT "trades_proposing_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "trades" DROP CONSTRAINT "trades_receiving_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_from_team_id_teams_id_fk" FOREIGN KEY ("from_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_items" ADD CONSTRAINT "trade_items_to_team_id_teams_id_fk" FOREIGN KEY ("to_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_proposing_team_id_teams_id_fk" FOREIGN KEY ("proposing_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_receiving_team_id_teams_id_fk" FOREIGN KEY ("receiving_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;