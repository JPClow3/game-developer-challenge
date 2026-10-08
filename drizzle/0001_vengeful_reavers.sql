CREATE TABLE "browser_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" text NOT NULL,
	"seed" integer NOT NULL,
	"session_duration_seconds" integer NOT NULL,
	"enemy_spawn_interval_seconds" integer NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "match_tickets_player_time_idx" ON "match_tickets" USING btree ("player_id","issued_at");--> statement-breakpoint
CREATE INDEX "matches_verified_ranking_idx" ON "matches" USING btree ("verified","session_duration_seconds","enemy_spawn_interval_seconds","score" DESC NULLS LAST,"duration_seconds","played_at","id");