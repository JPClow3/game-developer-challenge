import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('msw-scenario-widget')).toBeVisible();
});

test('published ranking uses fixtures and scenario selection refreshes the visible board', async ({ page }) => {
  await page.getByRole('tab', { name: /ranking/i }).click();
  await expect(page.getByText('Edward Teach (Blackbeard)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle network simulation scenarios panel' }).click();
  const selector = page.getByLabel('Choose a network scenario for evaluation and testing:');
  for (const scenario of ['success', 'empty', 'slow_network', 'timeout', 'error_500', 'error_400', 'out_of_order', 'server_offline']) {
    await expect(selector.locator(`option[value="${scenario}"]`)).toHaveCount(1);
  }
  await selector.selectOption('empty');
  await expect(page.getByText(/No matches recorded for this configuration yet/)).toBeVisible();
  await selector.selectOption('error_500');
  await expect(page.getByRole('alert')).toContainText('Failed to load ranking', { timeout: 15_000 });
  await selector.selectOption('success');
  await expect(page.getByText('Edward Teach (Blackbeard)', { exact: true })).toBeVisible();
});

test('all eight scenarios intercept requests in the built frontend without a backend', async ({ page }) => {
  await page.getByRole('button', { name: 'Toggle network simulation scenarios panel' }).click();
  for (const scenario of ['success', 'empty', 'slow_network', 'timeout', 'error_500', 'error_400', 'out_of_order', 'server_offline']) {
    await page.getByLabel('Choose a network scenario for evaluation and testing:').selectOption(scenario);
    await expect(page.getByTestId('msw-scenario-widget')).toContainText(`Network Lab: ${scenario}`);
    const result = await page.evaluate(async () => {
      const started = performance.now();
      try {
        const response = await fetch('/api/ranking?page=1&pageSize=8');
        return { status: response.status, data: await response.json(), elapsed: performance.now() - started };
      } catch { return { status: 0, data: null, elapsed: performance.now() - started }; }
    });
    if (scenario === 'timeout' || scenario === 'server_offline') expect(result.status).toBe(0);
    else if (scenario === 'error_500') expect(result.status).toBe(500);
    else if (scenario === 'error_400') expect(result.status).toBe(400);
    else {
      expect(result.status).toBe(200);
      if (scenario === 'empty') expect(result.data.items).toEqual([]);
      else expect(result.data.items[0].playerName).toBe('Edward Teach (Blackbeard)');
    }
    if (scenario === 'slow_network') expect(result.elapsed).toBeGreaterThanOrEqual(2400);
    if (scenario === 'timeout') expect(result.elapsed).toBeGreaterThanOrEqual(5900);
  }
});

test('mock submission persists in history across reload', async ({ page }) => {
  const status = await page.evaluate(async () => {
    const playerId = localStorage.getItem('pirate_battle_player_id_v1') || crypto.randomUUID();
    localStorage.setItem('pirate_battle_player_id_v1', playerId);
    const response = await fetch('/api/match', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: crypto.randomUUID(),
        playerId, playerName: 'Published Test Captain',
        score: 7, durationSeconds: 120, endReason: 'time_expired',
        config: { sessionDurationSeconds: 120, enemySpawnIntervalSeconds: 3 }, playedAt: new Date().toISOString() }),
    });
    return response.status;
  });
  expect(status).toBe(201);
  await page.reload();
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: /match history/i }).click();
  await expect(page.getByText('7 pts', { exact: true })).toBeVisible();
});

test('production plays Classic without a private session or debug globals', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.getByTestId('btn-set-sail').click();
  await expect(page.getByTestId('combat-canvas')).toBeVisible();
  expect(requests).not.toContain('/api/session');
  expect(await page.evaluate(() => ['__GAME_SIMULATION__', '__PIRATE_SIMULATION__', '__PIXI_GAME__']
    .every(key => (window as unknown as Record<string, unknown>)[key] === undefined))).toBe(true);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: /abandon match/i }).click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
});
