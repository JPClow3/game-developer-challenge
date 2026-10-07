import { test, expect } from '@playwright/test';

test.describe('Flow 05: Enemy AI Behaviors & Safe Spawning', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  });

  test('should verify Chaser ramming damages player without awarding score, and Shooter fires at distance', async ({ page }) => {
    await page.getByRole('button', { name: /set sail/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();
    await expect(page.getByTestId('combat-canvas')).toBeVisible();
    await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);

    // 1. Chaser ramming behavior: deals damage, awards 0 points on suicide
    const chaserRamResult = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      const initialScore = sim.score;
      const initialHp = sim.player.health;

      // Spawn chaser right beside player
      const chaser = sim.spawner.forceSpawn('chaser', sim.player.kinematic.x + 30, sim.player.kinematic.y);
      sim.enemies.push(chaser);

      // Step until contact detonation
      for (let i = 0; i < 20; i++) {
        sim.step(1 / 60);
      }

      return {
        damaged: sim.player.health < initialHp,
        scoreDelta: sim.score - initialScore,
      };
    });

    expect(chaserRamResult.damaged).toBe(true);
    expect(chaserRamResult.scoreDelta).toBe(0); // Suicide does NOT award points

    // 2. Shooter AI: maintains standoff distance and emits projectile
    const shooterResult = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      const shooter = sim.spawner.forceSpawn('shooter', sim.player.kinematic.x, sim.player.kinematic.y - 300);
      shooter.cooldownFront = 0;
      shooter.kinematic.rotation = Math.PI; // Face towards player (South)
      sim.enemies.push(shooter);

      const initialProjCount = sim.projectiles.length;
      sim.step(1 / 60);

      return {
        shooterFired: sim.projectiles.length > initialProjCount,
      };
    });

    expect(shooterResult.shooterFired).toBe(true);
  });
});
