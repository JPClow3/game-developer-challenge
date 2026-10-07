import { pgTable, text, varchar, integer, timestamp, index } from 'drizzle-orm/pg-core';

/**
 * Matches Table - Stores completed single-player naval battle sessions.
 * Designed for Neon PostgreSQL with UUID idempotency key to prevent duplication on retries.
 */
export const matches = pgTable(
  'matches',
  {
    id: text('id').primaryKey(), // UUID v4 idempotency key
    playerId: varchar('player_id', { length: 128 }).notNull(),
    playerName: varchar('player_name', { length: 128 }).default('Captain Anonymous'),
    score: integer('score').notNull().default(0),
    durationSeconds: integer('duration_seconds').notNull(),
    endReason: varchar('end_reason', { length: 32 }).notNull(), // 'time_expired' | 'player_destroyed'
    sessionDurationSeconds: integer('session_duration_seconds').notNull().default(90),
    enemySpawnIntervalSeconds: integer('enemy_spawn_interval_seconds').notNull().default(3),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    scoreIdx: index('matches_score_idx').on(table.score),
    playerIdx: index('matches_player_id_idx').on(table.playerId),
    playedAtIdx: index('matches_played_at_idx').on(table.playedAt),
  })
);

export type MatchEntity = typeof matches.$inferSelect;
export type InsertMatchEntity = typeof matches.$inferInsert;
