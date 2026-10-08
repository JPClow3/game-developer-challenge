ALTER TABLE "match_tickets" ADD COLUMN "difficulty" varchar(16) DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_tickets" ADD COLUMN "map" varchar(16) DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "difficulty" varchar(16) DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "map" varchar(16) DEFAULT 'classic' NOT NULL;