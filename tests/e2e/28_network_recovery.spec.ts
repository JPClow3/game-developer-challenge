import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

const pendingKey = 'pirate_battle_pending_submissions_v1';
const matchesKey = 'pirate_battle_mock_matches_v1';

async function finish(page: Page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  await page.evaluate(() => {
    const sim = (window as any).__PIRATE_SIMULATION__;
    sim.score = 37;
    sim.endMatch('time_expired');
  });
  await expect(page.getByTestId('result-screen')).toBeVisible();
}

for (const [scenario, rankingStatus, historyStatus] of [
  ['ranking_fails', 500, 200], ['history_fails', 200, 500],
] as const) {
  test(`${scenario} isolates the failed tab and can be selected from the URL`, async ({ page, expectNetworkFailure }) => {
    expectNetworkFailure(rankingStatus === 500 ? '/api/ranking' : '/api/history',
      'Failed to load resource: the server responded with a status of 500 (Internal Server Error)');
    await page.goto(`/?scenario=${scenario}`);
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('msw-scenario-widget')).toContainText(scenario);
    const statuses = await page.evaluate(async () => Promise.all([
      fetch('/api/ranking').then(response => response.status),
      fetch('/api/history').then(response => response.status),
    ]));
    expect(statuses).toEqual([rankingStatus, historyStatus]);
  });
}

test('timeout saves before losing the response, then restart deduplicates and drains automatically', async ({ page, expectNetworkFailure }) => {
  expectNetworkFailure('/api/match', 'Failed to load resource: net::ERR_FAILED');
  await page.goto('/?scenario=timeout');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await finish(page);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, pendingKey)).toBe(1);
  const id = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!)[0].id, pendingKey);
  await expect.poll(() => page.evaluate(({ key, id }) =>
    JSON.parse(localStorage.getItem(key) || '[]').filter((match: { id: string }) => match.id === id).length,
  { key: matchesKey, id })).toBe(1);
  // Wait for Axios to report its five-second timeout, proving the first response was lost.
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]')[0]?.lastError, pendingKey),
    { timeout: 10000 }).toMatch(/timeout/i);
  let duplicateResponse: { isDuplicate: boolean } | undefined;
  page.on('response', async response => {
    if (response.url().endsWith('/api/match') && response.status() === 200) duplicateResponse = await response.json();
  });
  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, pendingKey)).toBe(0);
  await expect.poll(() => duplicateResponse?.isDuplicate).toBe(true);
  expect(await page.evaluate(({ key, id }) =>
    JSON.parse(localStorage.getItem(key) || '[]').filter((match: { id: string }) => match.id === id).length,
  { key: matchesKey, id })).toBe(1);
});

test('refreshing during a slow submission preserves and automatically syncs the result', async ({ page }) => {
  await page.goto('/?scenario=slow_network');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await finish(page);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, pendingKey)).toBe(1);
  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, pendingKey),
    { timeout: 10000 }).toBe(0);
  await page.getByRole('tab', { name: /match history/i }).click();
  await expect(page.getByText('37 pts', { exact: true })).toHaveCount(1);
});

test('lost acknowledgement differs from timeout and retry confirms the committed match once', async ({ page, expectNetworkFailure }) => {
  expectNetworkFailure('/api/match', 'Failed to load resource: net::ERR_FAILED');
  await page.goto('/?scenario=idempotency_recovery');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await finish(page);
  await expect(page.getByRole('alert')).toContainText('Network Error');
  const request = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!)[0].request, pendingKey);
  expect(await page.evaluate(async () => (await fetch('/api/ranking')).status)).toBe(200);
  await page.getByRole('button', { name: 'Retry Registration', exact: true }).click();
  await expect(page.getByText('Already recorded. Your score was counted once.')).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, pendingKey)).toBe(0);
  expect(await page.evaluate(({ key, id }) => JSON.parse(localStorage.getItem(key) || '[]')
    .filter((match: { id: string }) => match.id === id).length, { key: matchesKey, id: request.id })).toBe(1);
});

test('background rejection updates the result and survives refresh without another POST', async ({ page, expectNetworkFailure }) => {
  await page.goto('/?scenario=server_offline');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  expectNetworkFailure('/api/match', 'Failed to load resource: net::ERR_FAILED');
  await finish(page);
  await expect(page.getByRole('button', { name: 'Retry Registration', exact: true })).toBeVisible();
  expectNetworkFailure('/api/match', 'Failed to load resource: the server responded with a status of 400 (Bad Request)');
  await page.getByRole('button', { name: 'Toggle network simulation scenarios panel' }).click();
  await page.locator('#msw-scenario-select').selectOption('error_400');
  // Online sync runs independently of the result's foreground mutation.
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const rejection = page.getByTestId('submission-rejected');
  await expect(rejection).toContainText('This battle was not recorded in the leaderboard.');
  await expect(rejection).toContainText('HTTP 400');
  await expect(page.getByRole('button', { name: 'Retry Registration', exact: true })).toHaveCount(0);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').length, pendingKey)).toBe(0);
  let posts = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/match')) posts++; });
  await page.goto('/?scenario=success#last-result');
  await expect(page.getByTestId('submission-rejected')).toContainText('HTTP 400');
  await expect(page.getByTestId('result-screen')).toBeVisible();
  expect(posts).toBe(0);
});

test('seeded request pairs finish out of order for ranking and history', async ({ page }) => {
  await page.goto('/?scenario=out_of_order&scenarioSeed=42');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  const orders = await page.evaluate(async () => {
    return Promise.all(['ranking', 'history'].map(async endpoint => {
      const order: number[] = [];
      await Promise.all([1, 2].map(async pageNumber => {
        const response = await fetch(`/api/${endpoint}?page=${pageNumber}`);
        if (!response.ok) throw new Error(`Unexpected ${response.status}`);
        await response.json();
        order.push(pageNumber);
      }));
      return order;
    }));
  });
  expect(orders).toEqual([[2, 1], [2, 1]]);
});
