import { test, expect } from './fixtures';

async function start(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
}

test('touch helm remains usable in landscape and releases outside the button', async ({page,isMobile}) => {
  test.skip(!isMobile);
  await page.setViewportSize({width:851,height:393});
  await start(page);
  const forward = page.getByRole('button',{name:'Move forward',exact:true});
  const bounds=await forward.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x+25,bounds!.y+25);await page.mouse.down();
  await expect(forward).toHaveAttribute('aria-pressed','true');
  await expect.poll(() => page.evaluate(() =>
    (window as any).__PIRATE_SIMULATION__.player.kinematic.velocityY)).toBeLessThan(0);
  await page.mouse.move(400,150);await page.mouse.up();
  await expect(forward).toHaveAttribute('aria-pressed','false');
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(0);
});

test('paused held keyboard commands require a fresh press after resuming', async ({page}) => {
  await start(page);
  await page.keyboard.down('w');
  await expect.poll(() => page.evaluate(() =>
    (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Resume Battle',exact:true}).click();
  await page.keyboard.press('e');
  expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(0);
  await page.keyboard.up('w');
});

test('menu tabs and dialogs support keyboard navigation and focus restoration', async ({page}) => {
  await page.goto('/');
  const play = page.getByRole('tab',{name:'Play Battle'});
  await play.focus();await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Ranking'})).toBeFocused();
  await page.keyboard.press('Home');
  await expect(play).toHaveAttribute('aria-selected','true');
  await page.getByTestId('btn-options').click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('button',{name:'Close options modal'})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  await dialog.getByRole('button',{name:'Close options modal'}).click();
  await expect(page.getByTestId('btn-options')).toBeFocused();
});

test('harbor, stable battle, and result visual baselines', async ({page},testInfo) => {
  const capture=async (id:string,name:string,mask: import('@playwright/test').Locator[] = []) => {
    const element=page.getByTestId(id);
    // Linux baselines are generated in the pinned Playwright Docker image.
    // macOS uses those same baselines through npm run test:visual:docker.
    await expect(element).toHaveScreenshot(name,{animations:'disabled',mask});
    await testInfo.attach(name,{body:await element.screenshot({animations:'disabled',mask}),contentType:'image/png'});
  };
  const errors: string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await page.getByTestId('main-menu').waitFor();
  await capture('main-menu','harbor.png',[page.getByTestId('msw-scenario-widget')]);
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  await page.evaluate(() => {
    const game=(window as any).__PIXI_GAME__,sim=(window as any).__PIRATE_SIMULATION__;
    game.app.ticker.stop();sim.spawner.setSeed(123);sim.elapsedSeconds=0;sim.remainingSeconds=sim.durationSeconds;
    sim.player.kinematic.x=sim.player.kinematic.prevX=800;sim.player.kinematic.y=sim.player.kinematic.prevY=800;sim.player.kinematic.velocityX=sim.player.kinematic.velocityY=0;
    sim.alpha=1;
    sim.enemies=[];sim.projectiles=[];
    const enemy=sim.spawner.forceSpawn('shooter',1200,350);enemy.kinematic.rotation=0;sim.enemies.push(enemy);
    game.renderFrame();game.app.render();
  });
  await capture('game-active-arena','battle.png');
  await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.endMatch('time_expired'));
  await page.getByTestId('result-screen').waitFor();
  const registration=page.getByText('Confirmed in Leaderboard',{exact:false});
  await expect(registration).toBeVisible();
  // Rank varies with seeded mock rows. Verify the status, then mask its dynamic banner.
  await capture('result-screen','result.png',[page.getByTestId('msw-scenario-widget'),registration.locator('..')]);
  expect(errors).toEqual([]);
});


test('completion and abandonment dispose the old simulation before another voyage', async ({page}) => {
  await start(page);
  await page.evaluate(() => {
    (window as any).__OLD_SIM__=(window as any).__PIRATE_SIMULATION__;
    (window as any).__OLD_SIM__.endMatch('time_expired');
  });
  await page.getByTestId('result-screen').waitFor();
  await expect.poll(() => page.evaluate(() => (window as any).__OLD_SIM__.cleanupWindowListeners === null && !(window as any).__PIRATE_SIMULATION__)).toBe(true);
  await page.getByRole('button',{name:'Play Again',exact:true}).click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  await expect(page.locator('canvas')).toHaveCount(1);
  await page.evaluate(() => { (window as any).__OLD_SIM__=(window as any).__PIRATE_SIMULATION__; });
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  await page.getByRole('button',{name:/abandon match/i}).click();
  await page.getByTestId('main-menu').waitFor();
  await expect.poll(() => page.evaluate(() => (window as any).__OLD_SIM__.cleanupWindowListeners === null && !(window as any).__PIRATE_SIMULATION__ && !(window as any).__PIXI_GAME__)).toBe(true);
  await expect(page.locator('canvas')).toHaveCount(0);
});
