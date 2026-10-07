import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { desc, asc, eq, and } from 'drizzle-orm';
import { matches } from '../../src/db/schema';
import type { RankingItem, PaginatedResponse } from '../../src/types/api';

interface Env {
  DATABASE_URL?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') || '10', 10)));
  const sessionDuration = url.searchParams.get('sessionDuration')
    ? parseInt(url.searchParams.get('sessionDuration')!, 10)
    : undefined;
  const spawnInterval = url.searchParams.get('spawnInterval')
    ? parseInt(url.searchParams.get('spawnInterval')!, 10)
    : undefined;

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

    const conditions = [];
    if (sessionDuration !== undefined) {
      conditions.push(eq(matches.sessionDurationSeconds, sessionDuration));
    }
    if (spawnInterval !== undefined) {
      conditions.push(eq(matches.enemySpawnIntervalSeconds, spawnInterval));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch total count
    const allMatches = await db
      .select()
      .from(matches)
      .where(whereClause)
      .orderBy(desc(matches.score), asc(matches.durationSeconds), asc(matches.playedAt));

    const totalItems = allMatches.length;
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const offset = (page - 1) * pageSize;
    const paginatedMatches = allMatches.slice(offset, offset + pageSize);

    const items: RankingItem[] = paginatedMatches.map((m, index) => ({
      rank: offset + index + 1,
      matchId: m.id,
      playerId: m.playerId,
      playerName: m.playerName || 'Anonymous Pirate',
      score: m.score,
      durationSeconds: m.durationSeconds,
      sessionDurationSeconds: m.sessionDurationSeconds,
      enemySpawnIntervalSeconds: m.enemySpawnIntervalSeconds,
      playedAt: m.playedAt.toISOString(),
    }));

    const responseData: PaginatedResponse<RankingItem> = {
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
        'Cache-Control': 'public, max-age=5',
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: 'Failed to query leaderboard from Neon database',
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
