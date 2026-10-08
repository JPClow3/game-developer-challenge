import { test, expect } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';
import type { ApiHandler } from '../../functions/lib/http';

let pg: PGlite;
let loader: ViteDevServer;
let database: ReturnType<typeof drizzle<typeof schema>>;
const handlers: Record<string, ApiHandler> = {};

test.beforeAll(async () => {
  pg = new PGlite();database = Object.assign(drizzle(pg, { schema }), { batch: async (queries: PromiseLike<unknown>[]) => Promise.all(queries) });
  await migrate(database, { migrationsFolder: './drizzle' });
  Object.assign(globalThis, { __LEADERBOARD_TEST_DB__: database });
  loader = await createServer({ root: process.cwd(), configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null }, plugins: [{ name: 'isolated-leaderboard-database', transform(code, id) {
      if (/\/functions\/api\/(match|session|ranking|history)\.ts$/.test(id))
        return code.replace(/import \{ createDbClient \} from [^;]+;/, 'const createDbClient = () => globalThis.__LEADERBOARD_TEST_DB__;');
      return undefined;
    } }] });
  for (const name of ['session', 'match', 'ranking', 'history']) {
    const module = await loader.ssrLoadModule(`/functions/api/${name}.ts`);
    handlers[name] = module.onRequestPost ?? module.onRequestGet;
  }
});

test.afterAll(async () => { await loader?.close();await pg?.close();Reflect.deleteProperty(globalThis, '__LEADERBOARD_TEST_DB__'); });
test.beforeEach(async ({ page }) => {
  await pg.exec('TRUNCATE matches, match_tickets, browser_sessions');
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const browserRequest = route.request();
    const path = new URL(browserRequest.url()).pathname.split('/').at(-1)!;
    const handler = handlers[path];
    if (!handler) throw new Error(`Unexpected API route: ${path}`);
    const request = new Request(browserRequest.url(), { method: browserRequest.method(),
      headers: await browserRequest.allHeaders(), body: browserRequest.postData() ?? undefined });
    const response = await handler({ request, env: { DATABASE_URL: 'isolated-postgres-only' } });
    const body = await response.text();
    if (path === 'session' && response.status === 201) {
      const ticket = JSON.parse(body) as { id: string };
      // The isolated ticket clock permits a fast-forwarded natural match in the test.
      await database.update(schema.matchTickets).set({ issuedAt: new Date(Date.now() - 181_000) }).where(eq(schema.matchTickets.id, ticket.id));
    }
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
  });
  await page.goto('/');await expect(page.getByTestId('main-menu')).toBeVisible();
});

test('live client receives a ticket, submits verified gameplay and highlights its ranked row', async ({ page }) => {
  await page.getByRole('button', { name: /^Play$/i }).click();
  await expect(page.getByTestId('combat-canvas')).toBeVisible();
  await page.evaluate(() => {
    const sim = (window as any).__PIRATE_SIMULATION__;
    sim.resume();sim.setInputs({ throttle: 1, steer: -.3, fireFront: true, fireBroadsideLeft: true });
    while (!sim.isEnded) sim.step(sim.fixedTimestep);
  });
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await expect(page.getByText(/Confirmed in Leaderboard/)).toBeVisible({ timeout: 15_000 });
  expect(await database.select().from(schema.matches)).toHaveLength(1);
  expect((await database.select().from(schema.matches))[0]?.verified).toBe(true);
  await page.getByRole('button', { name: /main menu/i }).click();
  await page.getByRole('tab', { name: /ranking/i }).click();
  await expect(page.getByText('You', { exact: true })).toBeVisible();
  const playerRow = page.getByRole('row').filter({ has: page.getByText('You', { exact: true }) });
  await expect(playerRow.getByRole('cell').first()).toHaveText('1');
});

test('a forged early result is rejected visibly and never queued or ranked', async ({ page }) => {
  await page.getByRole('button', { name: /^Play$/i }).click();
  await expect(page.getByTestId('combat-canvas')).toBeVisible();
  await page.evaluate(() => {
    const sim = (window as any).__PIRATE_SIMULATION__;
    sim.resume();sim.step(sim.fixedTimestep);sim.score = 99;sim.endMatch('time_expired');
  });
  await expect(page.getByText(/Ranking rejected this result/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Retry Registration' })).toHaveCount(0);
  expect(await database.select().from(schema.matches)).toHaveLength(0);
  const pending = await page.evaluate(() => JSON.parse(localStorage.getItem('pirate_battle_pending_submissions_v1') || '[]'));
  expect(pending).toEqual([]);
});
