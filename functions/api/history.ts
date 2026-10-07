import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { desc, eq } from 'drizzle-orm';
import { matches } from '../../src/db/schema';
import type { MatchRecord, PaginatedResponse } from '../../src/types/api';

interface Env {
  DATABASE_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const playerId = url.searchParams.get('playerId');
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '10', 10)));

  const dbUrl = context.env.DATABASE_URL;
  if (!dbUrl) {
    return new Response(
      JSON.stringify({
        error: 'DATABASE_URL not configured on Cloudflare Pages environment.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const sql = neon(dbUrl);
    const db = drizzle(sql);

    const whereClause = playerId ? eq(matches.playerId, playerId) : undefined;

    const userMatches = await db
      .select()
      .from(matches)
      .where(whereClause)
      .orderBy(desc(matches.playedAt));

    const totalItems = userMatches.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const offset = (page - 1) * pageSize;
    const paginatedMatches = userMatches.slice(offset, offset + pageSize);

    const items: MatchRecord[] = paginatedMatches.map((m) => ({
      id: m.id,
      playerId: m.playerId,
      playerName: m.playerName || undefined,
      score: m.score,
      durationSeconds: m.durationSeconds,
      endReason: m.endReason as 'time_expired' | 'player_destroyed',
      sessionDurationSeconds: m.sessionDurationSeconds,
      enemySpawnIntervalSeconds: m.enemySpawnIntervalSeconds,
      playedAt: m.playedAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
    }));

    const responseData: PaginatedResponse<MatchRecord> = {
      items,
      totalItems,
      page,
      pageSize,
      totalPages,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to query match history from Neon database',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
