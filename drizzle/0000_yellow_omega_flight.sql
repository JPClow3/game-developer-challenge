CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"player_id" varchar(128) NOT NULL,
	"player_name" varchar(128) DEFAULT 'Captain Anonymous',
	"score" integer DEFAULT 0 NOT NULL,
	"duration_seconds" integer NOT NULL,
	"end_reason" varchar(32) NOT NULL,
	"session_duration_seconds" integer DEFAULT 90 NOT NULL,
	"enemy_spawn_interval_seconds" integer DEFAULT 3 NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "matches_score_idx" ON "matches" USING btree ("score");--> statement-breakpoint
CREATE INDEX "matches_player_id_idx" ON "matches" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "matches_played_at_idx" ON "matches" USING btree ("played_at");