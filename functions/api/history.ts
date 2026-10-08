import { desc, eq, sql } from 'drizzle-orm';
import { createDbClient } from '../../src/db/client';
import { matches } from '../../src/db/schema';
import type { MatchRecord, PaginatedResponse } from '../../src/types/api';
import { json, queryParams, RequestError, type ApiHandler } from '../lib/http';

export const onRequestGet: ApiHandler = async ({ request, env }) => {
  try {
    const url = new URL(request.url);
    const { page, pageSize } = queryParams(url);
    const playerId = url.searchParams.get('playerId');
    if (playerId !== null && (!playerId || playerId.length > 128)) throw new RequestError('Invalid playerId');
    if (!env.DATABASE_URL) return json({ error: 'Database unavailable' }, 503);
    const db = createDbClient(env.DATABASE_URL);
    const where = playerId ? eq(matches.playerId, playerId) : undefined;
    const [counts, rows] = await db.batch([
      db.select({ count: sql<number>`count(*)` }).from(matches).where(where),
      db.select().from(matches).where(where).orderBy(desc(matches.playedAt), desc(matches.id)).limit(pageSize).offset((page - 1) * pageSize),
    ]);
    const totalItems = Number(counts[0]?.count || 0);
    const items: MatchRecord[] = rows.map((match) => ({ ...match, playerName: match.playerName || undefined,
      endReason: match.endReason as 'time_expired' | 'player_destroyed',
      playedAt: match.playedAt.toISOString(), createdAt: match.createdAt.toISOString() }));
    const response: PaginatedResponse<MatchRecord> = { items, totalItems, page, pageSize, totalPages: Math.ceil(totalItems / pageSize) || 1 };
    return json(response);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error('Failed to query match history');
    return json({ error: 'Failed to query match history' }, 500);
  }
};
