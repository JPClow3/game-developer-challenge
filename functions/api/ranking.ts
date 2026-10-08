import { sql } from 'drizzle-orm';
import { createDbClient } from '../../src/db/client';
import { matches } from '../../src/db/schema';
import type { RankingItem, PaginatedResponse } from '../../src/types/api';
import { rankingOrder, rankingScope, recordVoyage } from '../lib/ranking';
import { json, queryParams, RequestError, type ApiHandler } from '../lib/http';

export const onRequestGet: ApiHandler = async ({ request, env }) => {
  try {
    const { page, pageSize, sessionDuration, spawnInterval, voyage } = queryParams(new URL(request.url));
    if (!env.DATABASE_URL) return json({ error: 'Database unavailable' }, 503);
    const db = createDbClient(env.DATABASE_URL);
    const where = rankingScope(sessionDuration, spawnInterval,voyage);
    const offset = (page - 1) * pageSize;
    // Batch the database queries. Only one page of rows leaves Neon.
    const [counts, rows] = await db.batch([
      db.select({ count: sql<number>`count(*)` }).from(matches).where(where),
      db.select().from(matches).where(where).orderBy(...rankingOrder()).limit(pageSize).offset(offset),
    ]);
    const totalItems = Number(counts[0]?.count || 0);
    const items: RankingItem[] = rows.map((match, index) => ({ rank: offset + index + 1, matchId: match.id,
      playerId: match.playerId, voyage: recordVoyage(match), playerName: match.playerName || 'Anonymous Pirate', score: match.score,
      durationSeconds: match.durationSeconds, sessionDurationSeconds: match.sessionDurationSeconds,
      enemySpawnIntervalSeconds: match.enemySpawnIntervalSeconds, playedAt: match.playedAt.toISOString() }));
    const response: PaginatedResponse<RankingItem> = { items, totalItems, page, pageSize, totalPages: Math.ceil(totalItems / pageSize) || 1 };
    return json(response);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error('Failed to query leaderboard');
    return json({ error: 'Failed to query leaderboard' }, 500);
  }
};
