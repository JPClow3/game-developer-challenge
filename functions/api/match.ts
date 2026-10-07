import { eq, gt, sql } from 'drizzle-orm';
import { createDbClient } from '../../src/db/client';
import { matches } from '../../src/db/schema';
import type { SubmitMatchRequest, SubmitMatchResponse } from '../../src/types/api';

interface Env { DATABASE_URL?: string; }
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (!context.env.DATABASE_URL) return json({ error: 'Database unavailable' }, 503);
  let body: SubmitMatchRequest;
  try {
    body = await context.request.json() as SubmitMatchRequest;
  } catch {
    return json({ error: 'Invalid JSON payload' }, 400);
  }
  if (!body || typeof body !== 'object' ||
      typeof body.id !== 'string' || !body.id || body.id.length > 128 ||
      typeof body.playerId !== 'string' || !body.playerId || body.playerId.length > 128 ||
      (body.playerName !== undefined && (typeof body.playerName !== 'string' || body.playerName.length > 128)) ||
      !Number.isInteger(body.score) || body.score < 0 || body.score > 2147483647 ||
      !Number.isFinite(body.durationSeconds) || body.durationSeconds < 0 || body.durationSeconds > 180 ||
      !['time_expired', 'player_destroyed'].includes(body.endReason) ||
      !body.config || !Number.isInteger(body.config.sessionDurationSeconds) ||
      body.config.sessionDurationSeconds < 60 || body.config.sessionDurationSeconds > 180 ||
      !Number.isInteger(body.config.enemySpawnIntervalSeconds) ||
      body.config.enemySpawnIntervalSeconds < 1 || body.config.enemySpawnIntervalSeconds > 15 ||
      typeof body.playedAt !== 'string' || !Number.isFinite(Date.parse(body.playedAt))) {
    return json({ error: 'Invalid match fields' }, 400);
  }
  try {
    const db = createDbClient(context.env.DATABASE_URL);
    // Let the primary key arbitrate concurrent retries atomically.
    const inserted = await db.insert(matches).values({
      id: body.id, playerId: body.playerId, playerName: body.playerName || 'Anonymous Pirate',
      score: body.score, durationSeconds: Math.floor(body.durationSeconds), endReason: body.endReason,
      sessionDurationSeconds: body.config.sessionDurationSeconds,
      enemySpawnIntervalSeconds: body.config.enemySpawnIntervalSeconds,
      playedAt: new Date(body.playedAt),
    }).onConflictDoNothing({ target: matches.id }).returning();
    const record = inserted[0] ||
      (await db.select().from(matches).where(eq(matches.id, body.id)).limit(1))[0];
    if (!record) throw new Error('Match not found after insert');
    if (record.playerId !== body.playerId) return json({ error: 'Match ID belongs to another player' }, 409);
    const higherScores = await db.select({ count: sql<number>`count(*)` })
      .from(matches).where(gt(matches.score, record.score));
    const response: SubmitMatchResponse = {
      match: {
        ...record,
        playerName: record.playerName || undefined,
        endReason: record.endReason as 'time_expired' | 'player_destroyed',
        playedAt: record.playedAt.toISOString(), createdAt: record.createdAt.toISOString(),
      },
      rankingPosition: Number(higherScores[0]?.count || 0) + 1,
      isDuplicate: inserted.length === 0,
    };
    return json(response, inserted.length ? 201 : 200);
  } catch (error) {
    console.error('Failed to record match', error);
    return json({ error: 'Failed to record match' }, 500);
  }
};
