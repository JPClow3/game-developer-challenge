import { test, expect } from './fixtures';

test.describe('Flow 03: Combat Kinematics, Steering & Obstacle Collisions', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.log('PAGE ERROR:', err));
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 15000 });
  });

  test('should set sail, respond to keyboard steering and throttle, and respect collision boundaries', async ({ page }) => {
    // 1. Start match
    await page.getByRole('button', { name: /^Play$/i }).click();
    await expect(page.getByTestId('game-active-arena')).toBeVisible();
    await expect(page.getByTestId('combat-canvas')).toBeVisible();
    await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isReady);
    // Exercise real keyboard input with explicit physics time. Browser command
    // latency must not let unrelated combat end before the collision phase.
    await page.evaluate(() => (window as any).__PIXI_GAME__.app.ticker.stop());

    // 2. Initial state verification from window simulation harness
    const initialPos = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return { x: sim.player.kinematic.x, y: sim.player.kinematic.y, rot: sim.player.kinematic.rotation };
    });
    expect(initialPos.x).toBeGreaterThan(0);
    expect(initialPos.y).toBeGreaterThan(0);

    // 3. Move forward with W
    await page.keyboard.down('KeyW');
    try {
      expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(1);
      await page.evaluate(() => {
        const sim = (window as any).__PIRATE_SIMULATION__;
        for (let i = 0; i < 60; i++) sim.update(sim.fixedTimestep);
      });
      await expect.poll(() => page.evaluate(() =>
        (window as any).__PIRATE_SIMULATION__.player.kinematic.y)).toBeLessThan(initialPos.y);
    } finally {
      await page.keyboard.up('KeyW');
    }

    const movedPos = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return { x: sim.player.kinematic.x, y: sim.player.kinematic.y, rot: sim.player.kinematic.rotation };
    });
    // With heading 0 (pointing north), moving forward decreases y
    expect(movedPos.y).toBeLessThan(initialPos.y);

    // 4. Steer with D (turn right)
    await page.keyboard.down('KeyD');
    try {
      expect(await page.evaluate(() => (window as any).__PIRATE_SIMULATION__.currentInput.steer)).toBe(1);
      await page.evaluate(() => {
        const sim = (window as any).__PIRATE_SIMULATION__;
        for (let i = 0; i < 60; i++) sim.update(sim.fixedTimestep);
      });
      // Slow renderers can keep the key held long enough to cross +/-pi.
      // Check actual clockwise movement over the latest fixed simulation tick.
      await expect.poll(() => page.evaluate(() => {
        const state = (window as any).__PIRATE_SIMULATION__.player.kinematic;
        const delta = state.rotation - state.prevRotation;
        return state.angularVelocity > 0 ? Math.atan2(Math.sin(delta), Math.cos(delta)) : 0;
      })).toBeGreaterThan(0);
    } finally {
      await page.keyboard.up('KeyD');
    }

    // 5. Test island collision invariant: position cannot penetrate island center closer than radius
    const collisionCheck = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      if (sim.isEnded || sim.isPaused) throw new Error('Collision check requires an active simulation');
      const island = sim.obstacles[0];
      // Force player directly into island center
      sim.player.kinematic.x = island.x;
      sim.player.kinematic.y = island.y;
      sim.step(1 / 60);

      // Distance after collision resolution
      const dx = sim.player.kinematic.x - island.x;
      const dy = sim.player.kinematic.y - island.y;
      const dist = Math.hypot(dx, dy);
      return { dist, minAllowed: island.radius + 15 };
    });
    expect(collisionCheck.dist).toBeGreaterThanOrEqual(collisionCheck.minAllowed);
  });
});
