import { test, expect } from './fixtures';

async function start(page: import('@playwright/test').Page, practice = false) {
  await page.goto('/');
  await (practice ? page.getByRole('button', { name: /Practice voyage/ }) : page.getByTestId('btn-set-sail')).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
}

test('a lost practice target can be reset and completed using fresh keyboard input', async ({ page }, testInfo) => {
  await start(page, true);
  await expect(page.getByText('No limit', { exact: true })).toBeVisible();
  await page.keyboard.down('w');
  await expect(page.getByRole('status').filter({ hasText: '2 / 3' })).toBeVisible();
  await page.keyboard.up('w');
  await page.keyboard.down('w');
  await page.keyboard.down('a');
  await expect.poll(() => page.evaluate(() =>
    (window as any).__PIRATE_SIMULATION__.player.kinematic.angularVelocity)).toBeLessThan(0);
  await page.getByRole('button', { name: 'Reset lesson', exact: true }).click();
  const reset = await page.evaluate(() => {
    const s = (window as any).__PIRATE_SIMULATION__;
    return { x: s.player.kinematic.x, y: s.player.kinematic.y, rotation: s.player.kinematic.rotation,
      width: s.config.arena.width, height: s.config.arena.height, input: s.currentInput };
  });
  expect(reset.x).toBe(reset.width * .5);
  expect(reset.y).toBe(reset.height * .8);
  expect(reset.rotation).toBe(0);
  expect(reset.input.throttle).toBe(0);
  expect(reset.input.steer).toBe(0);
  // Browser repeats from keys still physically held must not undo recovery.
  await page.keyboard.down('w');
  await page.keyboard.down('a');
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(0);
  await page.keyboard.up('w');
  await page.keyboard.up('a');
  await page.keyboard.press('Space');
  await expect(page.getByRole('status').filter({ hasText: '3 / 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Reset lesson', exact: true }).click();
  await page.keyboard.press('q');
  await expect(page.getByRole('status').filter({ hasText: 'Ready for the high seas' })).toBeVisible();
  await testInfo.attach('recovered-practice', { body: await page.screenshot(), contentType: 'image/png' });
});

test('holding pause never resumes the game and held movement needs a fresh press', async ({ page }) => {
  await start(page);
  // This checks real keyboard events and input reset, not elapsed combat time.
  // A slow browser command must not let an unrelated enemy sink the vessel.
  await page.evaluate(() => (window as any).__PIXI_GAME__.app.ticker.stop());
  await page.keyboard.down('w');
  await page.keyboard.down('p');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.down('p');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.up('p');
  await page.getByRole('button', { name: 'Resume Battle', exact: true }).click();
  await page.keyboard.down('w');
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(0);
  await page.keyboard.up('w');
  await page.keyboard.down('w');
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(1);
  await page.keyboard.up('w');
});

test('short landscape screens keep options, pause and replay result actions reachable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 851, height: 320 });
  await page.goto('/');
  await page.getByTestId('btn-options').click();
  const options = page.getByRole('dialog');
  expect((await options.getByRole('heading').boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await options.getByRole('button', { name: /Save/i }).click();
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const pause = page.getByRole('dialog');
  expect((await pause.getByRole('heading').boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await pause.getByRole('button', { name: 'Resume Battle', exact: true }).click();
  await page.evaluate(() => {
    const g = (window as any).__PIXI_GAME__, s = g.simulation;
    g.app.ticker.stop();
    let ticks = 0;
    while (!s.isEnded && ticks++ < 11000) s.step(s.fixedTimestep);
  });
  const result = page.getByTestId('result-screen');
  await expect(result).toBeVisible();
  expect((await result.getByRole('heading').boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await result.getByRole('button', { name: 'Watch Replay', exact: true }).scrollIntoViewIfNeeded();
  await expect(result.getByRole('button', { name: 'Watch Replay', exact: true })).toBeInViewport();
  await result.getByRole('button', { name: 'Main Menu', exact: true }).scrollIntoViewIfNeeded();
  await expect(result.getByRole('button', { name: 'Main Menu', exact: true })).toBeInViewport();
  await testInfo.attach('landscape-result-actions', { body: await page.screenshot(), contentType: 'image/png' });
  await result.getByRole('button', { name: 'Main Menu', exact: true }).click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
});

test('legacy fractional options become score-compatible and cancelled edits are discarded', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pirate_battle_user_config_v1', JSON.stringify({
    sessionDurationSeconds: 80, spawner: { spawnIntervalSeconds: 3.5 },
  })));
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.voyage-settings')).toContainText('4s between enemies');
  await page.getByTestId('btn-options').click();
  await expect(page.locator('#spawn-interval')).toHaveAttribute('step', '1');
  await page.locator('#spawn-interval').fill('15');
  await page.locator('#session-duration').fill('100');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByTestId('btn-options').click();
  await expect(page.locator('#spawn-interval')).toHaveValue('4');
  await expect(page.locator('#session-duration')).toHaveValue('80');
  await page.locator('#spawn-interval').fill('15');
  await page.getByRole('button', { name: 'Save Options', exact: true }).click();
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.config.spawner.spawnIntervalSeconds)).toBe(15);
});

test('corrupt stored results return to the harbor without submitting a match', async ({ page }) => {
  let submissions = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/match')) submissions++; });
  await page.addInitScript(() => localStorage.setItem('pirate_battle_last_completed_match_v1', JSON.stringify({ score: 2 })));
  await page.goto('/#last-result');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  expect(submissions).toBe(0);
});

test('portrait camera keeps the hull clear of the HUD and helm at arena edges', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile);
  await start(page);
  const clearances = await page.evaluate(() => {
    const g = (window as any).__PIXI_GAME__, s = g.simulation;
    g.app.ticker.stop();
    return [s.config.arena.margin, s.config.arena.height - s.config.arena.margin].map(y => {
      const k = s.player.kinematic;
      k.y = k.prevY = y;
      g.renderFrame();g.app.render();
      return { y: y * g.camera.scale + g.camera.y, halfHull: 35 * g.camera.scale };
    });
  });
  const hudBottom = (await page.locator('.battle-top').boundingBox())!;
  const helm = (await page.locator('.touch-helm').boundingBox())!;
  for (const clearance of clearances) {
    expect(clearance.y - clearance.halfHull).toBeGreaterThan(hudBottom.y + hudBottom.height);
    expect(clearance.y + clearance.halfHull).toBeLessThan(helm.y);
  }
  await testInfo.attach('portrait-edge-clearance', { body: await page.screenshot(), contentType: 'image/png' });
});
