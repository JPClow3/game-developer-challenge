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

    // 2. Initial state verification from window simulation harness
    const initialPos = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return { x: sim.player.kinematic.x, y: sim.player.kinematic.y, rot: sim.player.kinematic.rotation };
    });
    expect(initialPos.x).toBeGreaterThan(0);
    expect(initialPos.y).toBeGreaterThan(0);

    // 3. Move forward with W
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyW');

    const movedPos = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return { x: sim.player.kinematic.x, y: sim.player.kinematic.y, rot: sim.player.kinematic.rotation };
    });
    // With heading 0 (pointing north), moving forward decreases y
    expect(movedPos.y).toBeLessThan(initialPos.y);

    // 4. Steer with D (turn right)
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(400);
    await page.keyboard.up('KeyD');

    const turnedPos = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
      return sim.player.kinematic.rotation;
    });
    expect(turnedPos).toBeGreaterThan(initialPos.rot);

    // 5. Test island collision invariant: position cannot penetrate island center closer than radius
    const collisionCheck = await page.evaluate(() => {
      const sim = (window as any).__PIRATE_SIMULATION__;
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
