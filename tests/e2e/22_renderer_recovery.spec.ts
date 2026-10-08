import { expect, test, type Page } from './fixtures';

async function launch(page: Page) {
  await page.goto('/');
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  if (process.env.EXPECT_PRODUCTION_BUILD === 'true') {
    await expect(page.locator('script[src*="@vite/client"]')).toHaveCount(0);
    await expect(page.getByTestId('msw-scenario-widget')).toHaveCount(0);
  }
}

async function lose(page: Page) {
  return page.evaluate(async () => {
    const w = window as any, game = w.__PIXI_GAME__, sim = game.simulation;
    const extension = game.app.renderer.gl.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('WEBGL_lose_context is required for this test');
    w.__RECOVERY_EXTENSION__ = extension; w.__RECOVERY_SIM__ = sim; w.__RECOVERY_GAME__ = game; w.__RECOVERY_CANVAS__ = game.app.canvas;
    await new Promise<void>(resolve => {
      game.app.canvas.addEventListener('webglcontextlost', () => resolve(), { once: true });
      extension.loseContext();
    });
    return { tick: sim.tickCount, health: sim.player.health, score: sim.score };
  });
}

test('context loss freezes the voyage and restoration requires a fresh intentional resume', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await launch(page); await page.keyboard.down('w');
  const before = await lose(page);
  await expect(page.getByRole('dialog', { name: 'Game view interrupted' })).toBeVisible();
  await page.evaluate(() => {
    const sim = (window as any).__PIRATE_SIMULATION__;
    for (let i = 0; i < 60; i++) sim.update(1 / 60);
  });
  await page.screenshot({ path: testInfo.outputPath('interrupted-view.png'), mask: [page.getByTestId('msw-scenario-widget')] });
  const frozen = await page.evaluate(() => {
    const sim = (window as any).__PIRATE_SIMULATION__;
    return { tick: sim.tickCount, health: sim.player.health, score: sim.score, paused: sim.isPaused };
  });
  expect(frozen).toEqual({ ...before, paused: true });
  await expect(page.getByRole('dialog', { name: 'Game view interrupted' })).toBeVisible();
  await page.keyboard.press('p'); await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.isPaused)).toBe(true);
  await page.evaluate(async () => {
    const w = window as any;
    await new Promise<void>(resolve => {
      w.__RECOVERY_CANVAS__.addEventListener('webglcontextrestored', () => resolve(), { once: true });
      w.__RECOVERY_EXTENSION__.restoreContext();
    });
  });
  await expect(page.getByRole('dialog', { name: 'Game Paused' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.tickCount)).toBe(before.tick);
  await page.getByRole('button', { name: 'Resume Battle', exact: true }).click();
  await page.keyboard.down('w'); // A physically held key still needs release.
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(0);
  await page.keyboard.up('w'); await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as any).__PIRATE_SIMULATION__.tickCount)).toBeGreaterThan(before.tick);
  await page.keyboard.up('w');
  await page.screenshot({ path: testInfo.outputPath('restored-view.png'), mask: [page.getByTestId('msw-scenario-widget')] });
  expect(errors).toEqual([]);
});

test('manual view restoration keeps the simulation and state, then exits cleanly', async ({ page }, testInfo) => {
  // Two WebGL initializations plus recovery and cleanup can exceed the usual
  // budget on software GPU runners. Keep all state assertions and zero retries.
  testInfo.setTimeout(120_000);
  await launch(page);
  const before = await lose(page);
  const signature = await page.evaluate(() => {
    const sim = (window as any).__PIRATE_SIMULATION__;
    return JSON.stringify({ player: sim.player, enemies: sim.enemies, projectiles: sim.projectiles, tick: sim.tickCount });
  });
  await page.getByRole('button', { name: 'Restore game view', exact: true }).click();
  await page.waitForFunction(() => {
    const w = window as any; return w.__PIXI_GAME__?.isReady && w.__PIXI_GAME__ !== w.__RECOVERY_GAME__;
  }, undefined, { timeout: 60_000 });
  await expect(page.getByRole('dialog', { name: 'Game Paused' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).__PIXI_GAME__.audio.activeLoops.get('ocean_ambience_loop')?.gain.gain.value)).toBe(0);
  expect(await page.evaluate(() => {
    const w = window as any, sim = w.__PIRATE_SIMULATION__;
    return { sameSimulation: sim === w.__RECOVERY_SIM__, tick: sim.tickCount,
      signature: JSON.stringify({ player: sim.player, enemies: sim.enemies, projectiles: sim.projectiles, tick: sim.tickCount }),
      oldDestroyed: w.__RECOVERY_GAME__.isDestroyed, paused: sim.isPaused,
      volume: w.__PIXI_GAME__.audio.activeLoops.get('ocean_ambience_loop')?.gain.gain.value };
  })).toEqual({ sameSimulation: true, tick: before.tick, signature, oldDestroyed: true, paused: true, volume: 0 });
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Resume Battle', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('retry-restored-view.png'), mask: [page.getByTestId('msw-scenario-widget')] });
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: /Abandon Match/i }).click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const w = window as any;
    w.__RECOVERY_CANVAS__.dispatchEvent(new Event('webglcontextrestored'));
    return { game: !!w.__PIXI_GAME__, simulation: !!w.__PIRATE_SIMULATION__ };
  })).toEqual({ game: false, simulation: false });
});

test('failed graphics initialization pauses safely and supports retry or abandonment', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const w = window as any, original = HTMLCanvasElement.prototype.getContext;
    w.__BLOCK_COMBAT_GL__ = true;
    (HTMLCanvasElement.prototype as any).getContext = function (kind: string, ...args: any[]) {
      if (w.__BLOCK_COMBAT_GL__ && this.getAttribute('data-testid') === 'combat-canvas' && kind.startsWith('webgl')) return null;
      return (original as any).call(this, kind, ...args);
    };
  });
  await page.goto('/');
  await page.getByTestId('btn-set-sail').click();
  const failure = page.getByRole('dialog', { name: 'Game view unavailable' });
  await expect(failure).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('unavailable-view.png'), mask: [page.getByTestId('msw-scenario-widget')] });
  expect(await page.evaluate(() => {
    const w = window as any; w.__RECOVERY_SIM__ = w.__PIRATE_SIMULATION__;
    return { paused: w.__PIRATE_SIMULATION__.isPaused, tick: w.__PIRATE_SIMULATION__.tickCount };
  })).toEqual({ paused: true, tick: 0 });
  await page.keyboard.press('Escape'); await expect(failure).toBeVisible();
  await page.evaluate(() => { (window as any).__BLOCK_COMBAT_GL__ = false; });
  await failure.getByRole('button', { name: 'Restore game view', exact: true }).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isReady);
  await expect(page.getByRole('dialog', { name: 'Game Paused' })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__ === (window as any).__RECOVERY_SIM__)).toBe(true);
  await page.getByRole('button', { name: /Abandon Match/i }).click();
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('an initial pause before graphics are ready remains paused and starts ambience silently', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any, original = HTMLCanvasElement.prototype.getContext;
    w.__PAUSE_DURING_GL_INIT__ = false;
    (HTMLCanvasElement.prototype as any).getContext = function (kind: string, ...args: any[]) {
      if (!w.__PAUSE_DURING_GL_INIT__ && this.getAttribute('data-testid') === 'combat-canvas' && kind.startsWith('webgl')) {
        w.__PAUSE_DURING_GL_INIT__ = true;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
      }
      return (original as any).call(this, kind, ...args);
    };
  });
  await launch(page);
  await expect(page.getByRole('dialog', { name: 'Game Paused' })).toBeVisible();
  expect(await page.evaluate(() => ({ paused: (window as any).__PIRATE_SIMULATION__.isPaused, tick: (window as any).__PIRATE_SIMULATION__.tickCount }))).toEqual({ paused: true, tick: 0 });
  await expect.poll(() => page.evaluate(() => (window as any).__PIXI_GAME__.audio.activeLoops.get('ocean_ambience_loop')?.gain.gain.value)).toBe(0);
  await page.getByRole('button', { name: 'Resume Battle', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__PIRATE_SIMULATION__.tickCount)).toBeGreaterThan(0);
});
