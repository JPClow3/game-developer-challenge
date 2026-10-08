import { expect, test } from '@playwright/test';

test('delivered battle has one launch, two enemy types and no bonus progression', async ({
  page,
}, testInfo) => {
  await page.goto('/?voyage=daily');
  const menu = page.getByTestId('main-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Play', exact: true })).toHaveCount(1);
  await expect(menu.getByText(/Raid|Daily|Bounty|bounties|flagship/i)).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath('delivered-harbor.png'),
    mask: [page.getByTestId('msw-scenario-widget')],
  });
  await menu.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isReady);
  const battle = await page.evaluate(() => {
    const game = (window as any).__PIXI_GAME__,
      sim = game.simulation;
    game.app.ticker.stop();
    sim.player.health = sim.player.maxHealth = 5000;
    while (sim.elapsedSeconds < 95 && !sim.isEnded) sim.step(sim.fixedTimestep);
    game.renderFrame();
    game.app.render();
    return {
      mode: sim.mode,
      score: sim.score,
      types: sim.enemies.map((enemy: any) => enemy.type),
      hasRaid: 'raid' in sim,
      hasMultiplier: 'enhancedRaid' in sim,
    };
  });
  expect(battle.mode).toBe('match');
  expect(battle.hasRaid).toBe(false);
  expect(battle.hasMultiplier).toBe(false);
  expect(battle.score).toBe(0);
  expect(battle.types.length).toBeGreaterThan(0);
  expect(battle.types.every((type: string) => ['chaser', 'shooter'].includes(type))).toBe(true);
  await expect(page.getByText(/salvage|multiplier|flagship/i)).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('delivered-battle.png') });
});
