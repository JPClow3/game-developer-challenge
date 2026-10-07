import { test, expect } from '@playwright/test';

test.describe('Flow 04: Weapons Firing, Cooldowns & Scoring', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  });

  test('should fire frontal cannon, port/starboard broadsides, trigger cooldowns, and award points on destroy', async ({ page }) => {
    await page.getByRole('button', { name: /set sail/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();
    await expect(page.getByTestId('combat-canvas')).toBeVisible();
    await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);

    // 1. Fire Frontal Cannon with Space
    await page.keyboard.down('Space');
    await page.waitForTimeout(60);
    await page.keyboard.up('Space');
    await page.waitForTimeout(100);

    const frontState = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return {
        projectilesCount: sim.projectiles.length,
        cooldownFront: sim.weaponSystem.cooldownFront,
      };
    });

    expect(frontState.projectilesCount).toBeGreaterThanOrEqual(1);
    expect(frontState.cooldownFront).toBeGreaterThan(0);

    // 2. Fire Port and Starboard Broadsides (Q and E)
    await page.keyboard.down('KeyQ');
    await page.waitForTimeout(60);
    await page.keyboard.up('KeyQ');

    await page.keyboard.down('KeyE');
    await page.waitForTimeout(60);
    await page.keyboard.up('KeyE');
    await page.waitForTimeout(100);

    const broadsideState = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return {
        projectilesCount: sim.projectiles.length,
        cooldownLeft: sim.weaponSystem.cooldownLeftBroadside,
        cooldownRight: sim.weaponSystem.cooldownRightBroadside,
      };
    });

    // 1 front + 3 left + 3 right = 7 projectiles
    expect(broadsideState.projectilesCount).toBeGreaterThanOrEqual(7);
    expect(broadsideState.cooldownLeft).toBeGreaterThan(0);
    expect(broadsideState.cooldownRight).toBeGreaterThan(0);

    // 3. Test enemy destruction & score increase
    await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      // Spawn a low health enemy directly in front of the player
      const enemy = sim.spawner.forceSpawn('chaser', sim.player.kinematic.x, sim.player.kinematic.y - 120);
      enemy.health = 5;
      sim.enemies.push(enemy);

      // Reset cooldown and fire projectile to hit it
      sim.weaponSystem.cooldownFront = 0;
      const shots = sim.weaponSystem.fireFront(sim.player.kinematic, 'player');
      if (shots.length > 0) {
        sim.projectiles.push(...shots);
      }

      // Step until projectile impacts
      for (let i = 0; i < 30; i++) {
        sim.step(1 / 60);
      }
    });

    // Verify HUD score updated to 1
    await expect(page.getByTestId('hud-score-value')).toHaveText('1', { timeout: 3000 });
  });
});
