// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq, sql } from 'drizzle-orm';
import * as schema from '../../../src/db/schema';
import { onRequestPost as start } from '../../../functions/api/session';
import { onRequestPost as submit } from '../../../functions/api/match';
import { onRequestGet as ranking } from '../../../functions/api/ranking';
import { onRequestGet as history } from '../../../functions/api/history';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import { rankedGameplayConfig } from '../../../src/core/simulation/verifyScore';
import type { MatchTicket, SubmitMatchRequest, SubmitMatchResponse, RankingItem, PaginatedResponse } from '../../../src/types/api';

let pg: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
vi.mock('../../../src/db/client', () => ({ createDbClient: () => database }));
const env = { DATABASE_URL: 'local-test-only' };
const config = { sessionDurationSeconds: 60, enemySpawnIntervalSeconds: 3 };

function context(request: Request) {
  return { request, env } as unknown as Parameters<typeof start>[0];
}
const post = (path: string, body: unknown, cookie?: string, origin?: string) => context(new Request(`https://game.test/api/${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(origin ? { Origin: origin } : {}) },
  body: JSON.stringify(body),
}));
const get = (path: string) => context(new Request(`https://game.test/api/${path}`));

async function voyage() {
  const response = await start(post('session', config));
  expect(response.status).toBe(201);
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0]!;
  const ticket = await response.json() as MatchTicket;
  const simulation = new GameSimulation(rankedGameplayConfig(ticket.config), ticket.seed);
  try {
    while (!simulation.isEnded) {
      if (simulation.tickCount % 120 === 0) simulation.setInputs({ throttle: 1, steer: -.3, fireFront: true, fireBroadsideLeft: true });
      simulation.step(simulation.fixedTimestep);
    }
    const body: SubmitMatchRequest = { id: ticket.id, playerId: ticket.playerId, score: simulation.score,
      durationSeconds: Math.floor(simulation.durationSeconds - simulation.remainingSeconds),
      endReason: simulation.endReason as 'time_expired' | 'player_destroyed', config: ticket.config,
      playedAt: '1900-01-01T00:00:00Z', replay: simulation.getReplay()! };
    // Avoid waiting real minutes. Only the isolated database's ticket clock changes.
    await database.update(schema.matchTickets).set({ issuedAt: new Date(Date.now() - 181_000) }).where(eq(schema.matchTickets.id, ticket.id));
    return { body, cookie, ticket };
  } finally { simulation.destroy(); }
}

beforeAll(async () => {
  pg = new PGlite();
  database = Object.assign(drizzle(pg, { schema }), { batch: async (queries: PromiseLike<unknown>[]) => Promise.all(queries) });
  await migrate(database, { migrationsFolder: './drizzle' });
}, 60_000);
beforeEach(async () => { await pg.exec('TRUNCATE matches, match_tickets, browser_sessions'); });
afterAll(async () => { await pg.close(); });

describe('Live leaderboard endpoints against isolated PostgreSQL', () => {
  it('issues an HttpOnly identity and a configuration-bound random voyage', async () => {
    const response = await start(post('session', config));
    const cookie = response.headers.get('Set-Cookie')!;
    expect(cookie).toContain('HttpOnly');expect(cookie).toContain('SameSite=Strict');expect(cookie).toContain('Secure');
    const ticket = await response.json() as MatchTicket;
    expect(ticket.id).toMatch(/^[a-f0-9-]{36}$/);expect(ticket.playerId).toMatch(/^player_/);
    expect(ticket.config).toEqual(config);expect(ticket.seed).toBeGreaterThanOrEqual(0);
    const next = await start(post('session', config, cookie.split(';')[0]));
    expect((await next.json() as MatchTicket).playerId).toBe(ticket.playerId);
    expect(next.headers.get('Set-Cookie')).toBeNull();
  });

  it('accepts natural gameplay, gives a server timestamp, and returns the same rank as its board', async () => {
    const { body, cookie } = await voyage();
    const result = await submit(post('match', body, cookie));
    expect(result.status).toBe(201);
    const saved = await result.json() as SubmitMatchResponse;
    expect(saved.match.score).toBe(body.score);expect(saved.match.playedAt).not.toBe(body.playedAt);
    const board = await ranking(get('ranking?sessionDuration=60&spawnInterval=3'));
    const data = await board.json() as PaginatedResponse<RankingItem>;
    expect(data.items.find(item => item.matchId === body.id)?.rank).toBe(saved.rankingPosition);
    expect((await database.select().from(schema.matches))[0]?.verified).toBe(true);
  });

  it('rejects inflated points, edited rules, wrong seeds, and forged checkpoints before writing', async () => {
    const { body, cookie } = await voyage();
    const altered = structuredClone(body);altered.replay!.config = { ...altered.replay!.config, playerMaxHealth: 999 };
    const seed = structuredClone(body);seed.replay!.seed++;
    const hash = structuredClone(body);hash.score++;hash.replay!.checks.at(-1)!.hash = '00000000';
    for (const invalid of [{ ...body, score: 2147483647 }, { ...body, score: body.score + 1 }, altered, seed, hash, { ...body, replay: undefined }]) {
      expect((await submit(post('match', invalid, cookie))).status).toBe(400);
    }
    expect(await database.select().from(schema.matches)).toHaveLength(0);
  });

  it('derives an honest result independently of browser-specific checkpoint hashes', async () => {
    const { body, cookie } = await voyage();
    for (const check of body.replay!.checks) check.hash = '00000000';
    expect((await submit(post('match', body, cookie))).status).toBe(201);
  });

  it('rejects premature endings and elapsed time fabricated by a fast-forwarded client', async () => {
    const { body, cookie, ticket } = await voyage();
    await database.update(schema.matchTickets).set({ issuedAt: new Date() }).where(eq(schema.matchTickets.id, ticket.id));
    expect((await submit(post('match', body, cookie))).status).toBe(400);
    await database.update(schema.matchTickets).set({ issuedAt: new Date(Date.now() - 181_000) }).where(eq(schema.matchTickets.id, ticket.id));
    const premature = new GameSimulation(rankedGameplayConfig(config), ticket.seed);
    premature.step(premature.fixedTimestep);premature.endMatch('time_expired');
    try {
      expect((await submit(post('match', { ...body, score: 0, durationSeconds: 0, endReason: 'time_expired', replay: premature.getReplay() }, cookie))).status).toBe(400);
    } finally { premature.destroy(); }
  });

  it('rejects another browser identity, missing tickets, expired tickets and cross-origin writes', async () => {
    const { body, cookie } = await voyage();
    expect((await submit(post('match', body))).status).toBe(401);
    expect((await submit(post('match', { ...body, playerId: 'another-player' }, cookie))).status).toBe(403);
    expect((await submit(post('match', { ...body, id: crypto.randomUUID() }, cookie))).status).toBe(403);
    expect((await submit(post('match', body, cookie, 'https://attacker.test'))).status).toBe(403);
    expect((await start(post('session', config, cookie, 'https://attacker.test'))).status).toBe(403);
    await database.update(schema.matchTickets).set({ expiresAt: new Date(0) }).where(eq(schema.matchTickets.id, body.id));
    expect((await submit(post('match', body, cookie))).status).toBe(410);
  });

  it('deduplicates simultaneous retries, preserves expired-ticket retries of saved results, and rejects collisions', async () => {
    const { body, cookie } = await voyage();
    const responses = await Promise.all([submit(post('match', body, cookie)), submit(post('match', body, cookie))]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
    expect(await database.select().from(schema.matches)).toHaveLength(1);
    await database.update(schema.matchTickets).set({ expiresAt: new Date(0) }).where(eq(schema.matchTickets.id, body.id));
    const retry = await submit(post('match', body, cookie));expect(retry.status).toBe(200);
    expect((await retry.json() as SubmitMatchResponse).isDuplicate).toBe(true);
    expect((await submit(post('match', { ...body, score: body.score + 1 }, cookie))).status).toBe(409);
  });

  it('uses all tie-breakers and configuration scope across page boundaries and excludes legacy scores', async () => {
    const base = { playerId: 'seeded', score: 10, verified: true, durationSeconds: 30, endReason: 'player_destroyed',
      sessionDurationSeconds: 60, enemySpawnIntervalSeconds: 3, playedAt: new Date('2026-10-01T00:00:00Z') };
    await database.insert(schema.matches).values([
      { ...base, id: 'b' }, { ...base, id: 'a' }, { ...base, id: 'c', playedAt: new Date('2026-10-02T00:00:00Z') },
      { ...base, id: 'd', durationSeconds: 31 }, { ...base, id: 'e', score: 9 },
      { ...base, id: 'other-config', score: 100, sessionDurationSeconds: 180 }, { ...base, id: 'legacy', score: 999, verified: false },
    ]);
    const first = await (await ranking(get('ranking?sessionDuration=60&spawnInterval=3&pageSize=2'))).json() as PaginatedResponse<RankingItem>;
    const second = await (await ranking(get('ranking?sessionDuration=60&spawnInterval=3&pageSize=2&page=2'))).json() as PaginatedResponse<RankingItem>;
    expect(first.totalItems).toBe(5);expect(first.totalPages).toBe(3);
    expect(first.items.map(item => [item.matchId, item.rank])).toEqual([['a', 1], ['b', 2]]);
    expect(second.items.map(item => [item.matchId, item.rank])).toEqual([['c', 3], ['d', 4]]);
    const emptyPage = await (await ranking(get('ranking?sessionDuration=60&page=99'))).json() as PaginatedResponse<RankingItem>;
    expect(emptyPage.items).toEqual([]);expect(emptyPage.totalItems).toBe(5);
    const oldHistory = await (await history(get('history?playerId=seeded&pageSize=2'))).json() as PaginatedResponse<RankingItem>;
    expect(oldHistory.totalItems).toBe(7);expect(oldHistory.items).toHaveLength(2);
  });

  it.each(['page=abc', 'pageSize=abc', 'page=0', 'page=-1', 'page=1.5', 'pageSize=51', 'page=9999999999999999', 'sessionDuration=59', 'spawnInterval=1.5', 'spawnInterval=16', 'page='])('rejects malformed query %s', async query => {
    expect((await ranking(get(`ranking?${query}`))).status).toBe(400);
    expect((await history(get(`history?${query}`))).status).toBe(400);
  });

  it('rejects invalid voyage setup and oversized submission bodies', async () => {
    expect((await start(post('session', { ...config, enemySpawnIntervalSeconds: 1.5 }))).status).toBe(400);
    expect((await submit(post('match', { padding: 'x'.repeat(2_000_001) }))).status).toBe(413);
  });

  it('limits repeated starts for the same session', async () => {
    const response = await start(post('session', config));const cookie = response.headers.get('Set-Cookie')!.split(';')[0]!;
    for (let i = 1; i < 10; i++) expect((await start(post('session', config, cookie))).status).toBe(201);
    const limited = await start(post('session', config, cookie));expect(limited.status).toBe(429);expect(limited.headers.get('Retry-After')).toBe('60');
    expect(Number((await database.select({ count: sql<number>`count(*)` }).from(schema.matchTickets))[0]?.count)).toBe(10);
  });
});
