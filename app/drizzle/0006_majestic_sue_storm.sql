CREATE TABLE "scoring_sets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"rules" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scoring_sets_name_unique" ON "scoring_sets" USING btree ("name");