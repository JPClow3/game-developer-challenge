import { test, expect } from './fixtures';

test('keyboard weapons discharge full salvos, start cooldowns and score projectile kills', async ({page}) => {
  await page.goto('/');await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);
  // Capture cooldowns at discharge. Traces/screenshots may outlast a cooldown.
  await page.evaluate(() => {
    const sim=(window as any).__PIRATE_SIMULATION__;
    (window as any).__FIRED__=[];
    sim.addListener((event:any)=>{
      if(event.type==='projectile_spawned' && event.payload.owner==='player') {
        const weapon=event.payload.weaponType;
        (window as any).__FIRED__.push({weapon,cooldown:weapon==='front'?sim.weaponSystem.cooldownFront:weapon==='broadside_left'?sim.weaponSystem.cooldownLeftBroadside:sim.weaponSystem.cooldownRightBroadside});
      }
    });
  });
  for(const [key,weapon,count] of [['Space','front',1],['q','broadside_left',3],['e','broadside_right',3]] as const) {
    await page.keyboard.down(key);
    await expect.poll(()=>page.evaluate(weapon=>(window as any).__FIRED__.filter((shot:any)=>shot.weapon===weapon).length,weapon)).toBeGreaterThanOrEqual(count);
    await page.keyboard.up(key);
    const shots=await page.evaluate(weapon=>(window as any).__FIRED__.filter((shot:any)=>shot.weapon===weapon),weapon);
    expect(shots[0].cooldown).toBeGreaterThan(0);
  }
  await page.evaluate(() => {
    const sim=(window as any).__PIRATE_SIMULATION__;
    const enemy=sim.spawner.forceSpawn('chaser',sim.player.kinematic.x,sim.player.kinematic.y-120);
    enemy.health=5;sim.enemies.push(enemy);
    sim.weaponSystem.cooldownFront=0;
    sim.projectiles.push(...sim.weaponSystem.fireFront(sim.player.kinematic,'player'));
    for(let i=0;i<30;i++) sim.step(sim.fixedTimestep);
  });
  await expect(page.getByTestId('hud-score-value')).toHaveText('1');
});
