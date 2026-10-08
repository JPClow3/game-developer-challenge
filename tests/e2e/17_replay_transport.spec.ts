import { test, expect } from './fixtures';

test('replay speed, progress, pause and restart work without submitting another score', async ({ page }, testInfo) => {
  let submissions = 0;
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/api/match')) submissions++; });
  await page.goto('/');
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  await page.evaluate(() => {
    const game = (window as any).__PIXI_GAME__, sim = game.simulation;
    game.app.ticker.stop();
    sim.setInputs({ throttle: 1, steer: .25, fireFront: true });
    while (!sim.isEnded) {
      sim.step(sim.fixedTimestep);
    }
  });
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await expect.poll(() => submissions).toBe(1);
  await page.getByRole('button', { name: 'Watch Replay', exact: true }).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  const before = submissions;
  const speed = page.getByRole('combobox', { name: 'Replay speed' });
  await expect(speed).toHaveValue('1');
  await speed.selectOption('0.5');
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  const pausedTick = await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.tickCount);
  await page.evaluate(() => {
    const sim = (window as any).__PIRATE_SIMULATION__;
    for (let i = 0; i < 60; i++) sim.update(1 / 60);
  });
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.tickCount)).toBe(pausedTick);
  await page.getByRole('button', { name: 'Resume Battle', exact: true }).click();
  await speed.selectOption('4');
  const pace = await page.evaluate(() => {
    const game = (window as any).__PIXI_GAME__, sim = game.simulation;
    game.app.ticker.stop(); const start = sim.tickCount;
    for (let i = 0; i < 30; i++) sim.update(1 / 30);
    game.renderFrame(); game.app.render();
    return { ticks: sim.tickCount - start, speed: sim.replaySpeed };
  });
  expect(pace.speed).toBe(4); expect(pace.ticks).toBeGreaterThanOrEqual(239);
  await expect(page.getByLabel('Replay progress')).toContainText(/\d+s \/ \d+s/);
  for (const viewport of [{ width: 1280, height: 720 }, { width: 393, height: 851 }, { width: 320, height: 568 }, { width: 851, height: 320 }]) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => (window as any).__PIXI_GAME__.app.screen.width)).toBe(viewport.width);
    for (const control of [speed, page.getByRole('button', { name: 'Restart replay', exact: true }), page.getByRole('button', { name: 'Exit replay', exact: true })]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.screenshot({ path: testInfo.outputPath(`replay-${viewport.width}.png`), mask: [page.getByTestId('msw-scenario-widget')] });
  }
  await page.evaluate(() => { (window as any).__REPLAY_BEFORE_RESTART__ = (window as any).__PIRATE_SIMULATION__; });
  await page.getByRole('button', { name: 'Restart replay', exact: true }).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  await expect(speed).toHaveValue('1');
  expect(await page.locator('canvas').count()).toBe(1);
  expect(await page.evaluate(() => {
    const w = window as any, sim = w.__PIRATE_SIMULATION__, previous = w.__REPLAY_BEFORE_RESTART__;
    return sim !== previous && previous.cleanupWindowListeners === null &&
      sim.seed === previous.seed && sim.replayEndTick === previous.replayEndTick && sim.replayStatus === 'playing';
  })).toBe(true);
  await speed.selectOption('2');
  await page.evaluate(() => {
    const game = (window as any).__PIXI_GAME__, sim = game.simulation;
    game.app.ticker.stop(); let frames = 0;
    while (!sim.isEnded && frames++ < 11000) sim.update(1 / 30);
    game.renderFrame(); game.app.render();
  });
  await expect(page.getByRole('status').filter({ hasText: 'Replay verified' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to results', exact: true }).click();
  await expect(page.getByTestId('result-screen')).toBeVisible();
  expect(submissions).toBe(before); expect(errors).toEqual([]);
});
