import { eq, sql } from 'drizzle-orm';
import { createDbClient } from '../../src/db/client';
import { matches, matchTickets, type MatchEntity } from '../../src/db/schema';
import type { SubmitMatchRequest, SubmitMatchResponse } from '../../src/types/api';
import { isMatchConfig, sameVoyage } from '../../src/core/ranking';
import { verifyScore } from '../../src/core/simulation/verifyScore';
import { aheadOf, recordVoyage } from '../lib/ranking';
import { checkOrigin, getBrowserSession } from '../lib/sessions';
import { json, readJson, RequestError, type ApiHandler } from '../lib/http';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export const onRequestPost: ApiHandler = async ({ request, env }) => {
  if (!env.DATABASE_URL) return json({ error: 'Database unavailable' }, 503);
  try {
    checkOrigin(request);
    const body = await readJson(request) as SubmitMatchRequest;
    if (!body || typeof body !== 'object' || typeof body.id !== 'string' || !uuid.test(body.id) ||
      typeof body.playerId !== 'string' || !body.playerId || body.playerId.length > 128 ||
      (body.playerName !== undefined && (typeof body.playerName !== 'string' || body.playerName.length > 128)) ||
      !Number.isInteger(body.score) || body.score < 0 || body.score > 180 ||
      !Number.isInteger(body.durationSeconds) || body.durationSeconds < 0 || body.durationSeconds > 180 ||
      !['time_expired', 'player_destroyed'].includes(body.endReason) || !isMatchConfig(body.config) ||
      typeof body.playedAt !== 'string' || !Number.isFinite(Date.parse(body.playedAt))) throw new RequestError('Invalid match fields');

    const db = createDbClient(env.DATABASE_URL);
    const session = await getBrowserSession(request, db);
    if (!session) throw new RequestError('Your voyage session has expired. Start a new voyage.', 401);
    if (session.playerId !== body.playerId) throw new RequestError('Player identity does not match this browser session', 403);

    const respond = async (record: MatchEntity, isDuplicate: boolean) => {
      if (!record.verified || record.playerId !== session.playerId || record.score !== body.score ||
        record.durationSeconds !== body.durationSeconds || record.endReason !== body.endReason ||
        record.sessionDurationSeconds !== body.config.sessionDurationSeconds ||
        record.enemySpawnIntervalSeconds !== body.config.enemySpawnIntervalSeconds || !sameVoyage(recordVoyage(record),body.config.voyage))
        throw new RequestError('Match ID already has a different result', 409);
      const higher = await db.select({ count: sql<number>`count(*)` }).from(matches).where(aheadOf(record));
      const response: SubmitMatchResponse = { match: { ...record, voyage: recordVoyage(record), playerName: record.playerName || undefined,
        endReason: record.endReason as 'time_expired' | 'player_destroyed',
        playedAt: record.playedAt.toISOString(), createdAt: record.createdAt.toISOString() },
        rankingPosition: Number(higher[0]?.count || 0) + 1, isDuplicate };
      return json(response, isDuplicate ? 200 : 201);
    };
    const existing = (await db.select().from(matches).where(eq(matches.id, body.id)).limit(1))[0];
    if (existing) return await respond(existing, true);

    const ticket = (await db.select().from(matchTickets).where(eq(matchTickets.id, body.id)).limit(1))[0];
    if (!ticket || ticket.playerId !== session.playerId) throw new RequestError('A server-issued voyage is required', 403);
    if (ticket.expiresAt.getTime() <= Date.now()) throw new RequestError('This voyage has expired. Start a new voyage.', 410);
    if (ticket.sessionDurationSeconds !== body.config.sessionDurationSeconds ||
      ticket.enemySpawnIntervalSeconds !== body.config.enemySpawnIntervalSeconds || !sameVoyage(recordVoyage(ticket),body.config.voyage)) throw new RequestError('Voyage configuration changed');
    if (!body.replay || !Number.isInteger(body.replay.endTick) ||
      body.replay.endTick / 60 * 1000 > Date.now() - ticket.issuedAt.getTime() + 250)
      throw new RequestError('Voyage duration is inconsistent with its start');
    try { verifyScore(body, ticket.seed); }
    catch { throw new RequestError('Battle result failed server verification'); }

    // The server supplies the timestamp. The primary key arbitrates concurrent retries.
    const inserted = await db.insert(matches).values({ id: body.id, playerId: session.playerId,
      playerName: body.playerName?.trim() || 'Anonymous Pirate', score: body.score, verified: true,
      durationSeconds: body.durationSeconds, endReason: body.endReason,
      difficulty: ticket.difficulty, map: ticket.map,
      sessionDurationSeconds: ticket.sessionDurationSeconds, enemySpawnIntervalSeconds: ticket.enemySpawnIntervalSeconds,
      playedAt: new Date() }).onConflictDoNothing({ target: matches.id }).returning();
    const record = inserted[0] || (await db.select().from(matches).where(eq(matches.id, body.id)).limit(1))[0];
    if (!record) throw new Error('Match not found after insert');
    return await respond(record, inserted.length === 0);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error('Failed to record match');
    return json({ error: 'Failed to record match' }, 500);
  }
};
