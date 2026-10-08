import { expect, test, type Page } from './fixtures';
import { ASSET_SLOW_NOTICE_MS, RENDERER_INIT_TIMEOUT_MS } from '../../src/game/StartupRecovery';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  await page.clock.install();
  const messages: string[] = []; errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

async function stallAssets(page: Page) {
  await page.addInitScript(() => {
    const w = window as any, original = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const url = String((args[0] as Request)?.url || args[0]);
      if (url.includes('/assets/spritesheet/ui_sheet') && !sessionStorage.getItem('startup-recovery-allow-assets')) {
        w.__ASSET_WAITING__ = true;
        await new Promise<void>(resolve => { w.__RELEASE_ASSET__ = resolve; });
      }
      return original.apply(window, args);
    };
  });
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__ASSET_WAITING__);
  await expect(page.getByRole('button', { name: 'Reload game', exact: true })).toHaveCount(0);
  await page.clock.fastForward(ASSET_SLOW_NOTICE_MS + 100);
  await expect(page.getByRole('button', { name: 'Reload game', exact: true })).toBeVisible();
}

test('a stalled asset offers reload and preserves saved helm settings and saved battle result', async ({ page }, testInfo) => {
  await stallAssets(page);
  const saved = {
    pirate_battle_helm_v1: JSON.stringify({ swapped: true, toggleFire: false, muted: true, volume: .35 }),
    pirate_battle_last_completed_match_v1: JSON.stringify({ id: 'previous-battle', score: 4, endReason: 'time_expired' }),
  };
  await page.evaluate(saved => {
    for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value);
    sessionStorage.setItem('startup-recovery-allow-assets', '1');
  }, saved);
  await page.screenshot({ path: testInfo.outputPath('slow-assets.png'), mask: [page.getByTestId('msw-scenario-widget')] });
  await page.getByRole('button', { name: 'Reload game', exact: true }).click();
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(saved))).toEqual(saved);
  if (process.env.EXPECT_PRODUCTION_BUILD === 'true') {
    await expect(page.locator('script[src*="@vite/client"]')).toHaveCount(0);
    await expect(page.getByTestId('msw-scenario-widget')).toHaveCount(0);
  }
});

test('a late asset completion opens the harbor without forcing a reload', async ({ page }) => {
  await stallAssets(page);
  await page.evaluate(() => { (window as any).__RELEASE_ASSET__(); });
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Reload game', exact: true })).toHaveCount(0);
  await page.clock.fastForward(ASSET_SLOW_NOTICE_MS * 2);
  await expect(page.getByTestId('main-menu')).toBeVisible();
});

test('the slow-loading recovery remains reachable in a short landscape viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 851, height: 320 });
  await stallAssets(page);
  const reload = page.getByRole('button', { name: 'Reload game', exact: true });
  await reload.scrollIntoViewIfNeeded();
  const box = await reload.boundingBox(); expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('slow-assets-landscape.png'), mask: [page.getByTestId('msw-scenario-widget')] });
});

test('a hung graphics initialization expires, retries the same voyage, and ignores late completion', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isReady);
  await page.evaluate(() => {
    const w = window as any, prototype = Object.getPrototypeOf(w.__PIXI_GAME__.app), original = prototype.init;
    w.__STALL_GRAPHICS__ = true;
    prototype.init = async function (...args: any[]) {
      if (w.__STALL_GRAPHICS__) {
        w.__GRAPHICS_WAITING__ = true;
        await new Promise<void>(resolve => { w.__RELEASE_GRAPHICS__ = resolve; });
        const result = await original.apply(this, args);
        w.__LATE_GRAPHICS_COMPLETED__ = true;
        return result;
      }
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: /Abandon Match/i }).click();
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__GRAPHICS_WAITING__);
  await page.evaluate(() => {
    const w = window as any; w.__STALLED_GAME__ = w.__PIXI_GAME__; w.__STALLED_SIM__ = w.__PIRATE_SIMULATION__;
  });
  await page.clock.fastForward(RENDERER_INIT_TIMEOUT_MS + 100);
  const failure = page.getByRole('dialog', { name: 'Game view unavailable' });
  await expect(failure).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('graphics-timeout.png'), mask: [page.getByTestId('msw-scenario-widget')] });
  expect(await page.evaluate(() => {
    const w = window as any;
    return { tick: w.__STALLED_SIM__.tickCount, paused: w.__STALLED_SIM__.isPaused, destroyed: w.__STALLED_GAME__.isDestroyed };
  })).toEqual({ tick: 0, paused: true, destroyed: true });
  await page.evaluate(() => { (window as any).__STALL_GRAPHICS__ = false; });
  await failure.getByRole('button', { name: 'Restore game view', exact: true }).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isReady);
  await expect(page.getByRole('dialog', { name: 'Game Paused' })).toBeVisible();
  await page.evaluate(() => { (window as any).__RELEASE_GRAPHICS__(); });
  await page.waitForFunction(() => (window as any).__LATE_GRAPHICS_COMPLETED__);
  expect(await page.evaluate(() => {
    const w = window as any;
    return { sameVoyage: w.__PIRATE_SIMULATION__ === w.__STALLED_SIM__, sameView: w.__PIXI_GAME__ === w.__STALLED_GAME__, tick: w.__PIRATE_SIMULATION__.tickCount, paused: w.__PIRATE_SIMULATION__.isPaused };
  })).toEqual({ sameVoyage: true, sameView: false, tick: 0, paused: true });
  await expect(page.getByRole('dialog', { name: 'Game Paused' })).toBeVisible();
  await expect(page.getByTestId('combat-canvas')).toHaveCount(1);
  await page.getByRole('button', { name: 'Resume Battle', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__PIRATE_SIMULATION__.tickCount)).toBeGreaterThan(0);
});
