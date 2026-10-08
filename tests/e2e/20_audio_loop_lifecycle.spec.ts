import { expect, test, type Page } from './fixtures';

// Exercise the real WAV response. MSW's worker otherwise bypasses page routing
// in the development suite, leaving the delayed-response gate unresolved.
test.use({ serviceWorkers: 'block' });

async function startPractice(page: Page) {
  await page.getByRole('button', { name: /Practice voyage/ }).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  if (process.env.EXPECT_PRODUCTION_BUILD === 'true') {
    await expect(page.locator('script[src*="@vite/client"]')).toHaveCount(0);
    await expect(page.getByTestId('msw-scenario-widget')).toHaveCount(0);
  }
  // Keep only the existing audio singleton for observing state after game teardown.
  await page.evaluate(() => { (window as any).__LIFECYCLE_AUDIO__ = (window as any).__PIXI_GAME__.audio; });
}

async function delayedOcean(page: Page) {
  let release!: () => void;
  let completed!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const done = new Promise<void>(resolve => { completed = resolve; });
  await page.route('**/assets/sounds/ocean_ambience_loop.wav', async route => {
    const response = await route.fetch();
    await gate;
    await route.fulfill({ response });
    completed();
  });
  return { release, done };
}

async function finishOcean(page: Page, delayed: Awaited<ReturnType<typeof delayedOcean>>) {
  delayed.release();
  await delayed.done;
  await page.waitForFunction(() => {
    const audio = (window as any).__LIFECYCLE_AUDIO__;
    return audio.bufferCache.has('ocean_ambience_loop') && audio.pendingLoops.size === 0;
  });
}

test('a delayed ambience load stays silent after exit and starts once on the next voyage', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const delayed = await delayedOcean(page);
  try {
    await page.goto('/');
    await startPractice(page);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    await page.getByRole('button', { name: /abandon match/i }).click();
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await finishOcean(page, delayed);
    expect(await page.evaluate(() => {
      const w = window as any;
      return { loops: w.__LIFECYCLE_AUDIO__.activeLoops.size, game: !!w.__PIXI_GAME__, simulation: !!w.__PIRATE_SIMULATION__ };
    })).toEqual({ loops: 0, game: false, simulation: false });
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('quiet-harbor.png'), mask: [page.getByTestId('msw-scenario-widget')] });
    await startPractice(page);
    expect(await page.evaluate(() => {
      const audio = (window as any).__LIFECYCLE_AUDIO__;
      return { loops: audio.activeLoops.size, volume: audio.activeLoops.get('ocean_ambience_loop')?.gain.gain.value };
    })).toEqual({ loops: 1, volume: Math.fround(.35) });
    await page.screenshot({ path: testInfo.outputPath('restarted-voyage.png'), mask: [page.getByTestId('msw-scenario-widget')] });
    expect(errors).toEqual([]);
  } finally { delayed.release(); }
});

test('ambience finishing its load during pause remains silent until resume', async ({ page }, testInfo) => {
  const delayed = await delayedOcean(page);
  try {
    await page.goto('/');
    await startPractice(page);
    await page.getByRole('button', { name: 'Pause game', exact: true }).click();
    await finishOcean(page, delayed);
    expect(await page.evaluate(() => (window as any).__LIFECYCLE_AUDIO__.activeLoops.get('ocean_ambience_loop')?.gain.gain.value)).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('silent-pause.png'), mask: [page.getByTestId('msw-scenario-widget')] });
    await page.getByRole('button', { name: 'Resume Battle', exact: true }).click();
    expect(await page.evaluate(() => (window as any).__LIFECYCLE_AUDIO__.activeLoops.get('ocean_ambience_loop')?.gain.gain.value)).toBeCloseTo(.35);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { delayed.release(); }
});
