import { and, eq, gt, sql } from 'drizzle-orm';
import { createDbClient } from '../../src/db/client';
import { matchTickets } from '../../src/db/schema';
import { isMatchConfig } from '../../src/core/ranking';
import type { MatchTicket } from '../../src/types/api';
import { checkOrigin, ensureBrowserSession } from '../lib/sessions';
import { json, readJson, RequestError, type ApiHandler } from '../lib/http';

export const onRequestPost: ApiHandler = async ({ request, env }) => {
  if (!env.DATABASE_URL) return json({ error: 'Database unavailable' }, 503);
  try {
    checkOrigin(request);
    const config = await readJson(request, 1024);
    if (!isMatchConfig(config)) throw new RequestError('Invalid voyage configuration');
    const db = createDbClient(env.DATABASE_URL);
    const { session, cookie } = await ensureBrowserSession(request, db);
    const recent = await db.select({ count: sql<number>`count(*)` }).from(matchTickets).where(and(
      eq(matchTickets.playerId, session.playerId), gt(matchTickets.issuedAt, new Date(Date.now() - 60_000))));
    if (Number(recent[0]?.count) >= 10) return json({ error: 'Too many voyage starts. Try again in a minute.' }, 429,
      { 'Retry-After': '60', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
    const ticket: MatchTicket = { id: crypto.randomUUID(), playerId: session.playerId,
      seed: crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fffffff, config };
    const now = new Date();
    await db.insert(matchTickets).values({ id: ticket.id, playerId: ticket.playerId, seed: ticket.seed,
      sessionDurationSeconds: config.sessionDurationSeconds, enemySpawnIntervalSeconds: config.enemySpawnIntervalSeconds,
      issuedAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
    return json(ticket, 201, cookie ? { 'Set-Cookie': cookie } : {});
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error('Failed to start voyage');
    return json({ error: 'Failed to start voyage' }, 500);
  }
};
