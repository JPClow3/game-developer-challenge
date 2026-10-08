import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from './fixtures';

test('axe scans the menu, options, pause and result screens', async ({page}, testInfo) => {
  const scan = async (screen:string) => {
    const result=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    await testInfo.attach(`axe-${screen}`,{body:JSON.stringify(result,null,2),contentType:'application/json'});
    expect(result.violations, `${screen} accessibility violations`).toEqual([]);
  };
  await page.goto('/');await expect(page.getByTestId('main-menu')).toBeVisible();await scan('menu');
  await page.getByRole('button',{name:/options/i}).click();await scan('options');
  await page.getByRole('button',{name:/save options/i}).click();
  await page.getByTestId('btn-set-sail').click();await running(page);
  await page.getByRole('button',{name:'Pause game',exact:true}).click();await scan('pause');
  await page.getByRole('button',{name:/resume/i}).click();
  await page.evaluate(()=>{const game=(window as any).__PIXI_GAME__;game.app.ticker.stop();while(!game.simulation.isEnded) game.simulation.step(game.simulation.fixedTimestep);});
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await expect(page.getByText('Confirmed in Leaderboard')).toBeVisible();await scan('result');
});

async function running(page:Page) {await page.waitForFunction(()=>(window as any).__PIXI_GAME__?.isReady);}

test('debug draws physics geometry and projectile lifetimes only when requested',async({page},testInfo)=>{
  await page.goto('/?debug');await page.getByTestId('btn-set-sail').click();await running(page);
  const counts=await page.evaluate(()=>{
    const game=(window as any).__PIXI_GAME__,sim=game.simulation;game.app.ticker.stop();
    sim.enemies.push(sim.spawner.forceSpawn('shooter',950,200));
    sim.setInputs({fireFront:true});sim.step(sim.fixedTimestep);game.renderFrame();game.app.render();
    return game.debugOverlay.counts;
  });
  expect(counts.shipDisks).toBe(4);expect(counts.islands).toBe(3);expect(counts.shooters).toBe(1);expect(counts.projectiles).toBeGreaterThan(0);
  await testInfo.attach('debug-geometry',{body:await page.screenshot(),contentType:'image/png'});
  await page.goto('/');await page.getByTestId('btn-set-sail').click();await running(page);
  expect(await page.evaluate(()=>(window as any).__PIXI_GAME__.debugOverlay)).toBeUndefined();
});

test('Network Lab exposes cancellation, seeded latency, retries and duplicate acknowledgement',async({page,expectNetworkFailure},testInfo)=>{
  await page.goto('/');await page.getByRole('button',{name:'Toggle network simulation scenarios panel'}).click();
  await page.getByLabel('Network seed',{exact:true}).fill('42');await page.getByLabel('Additional latency (ms)',{exact:true}).fill('900');
  await page.getByRole('tab',{name:/ranking/i}).click();
  const log=page.getByRole('list',{name:'Live request log'});
  await expect(log).toContainText('pending');
  await page.locator('#msw-scenario-select').selectOption('empty');
  await expect(log).toContainText('cancelled stale response');
  await expect(page.getByText('No matches recorded for this configuration yet')).toBeVisible();
  await page.getByLabel('Additional latency (ms)',{exact:true}).fill('0');
  expectNetworkFailure('/api/ranking','Failed to load resource: the server responded with a status of 500 (Internal Server Error)',3);
  await page.locator('#msw-scenario-select').selectOption('error_500');
  await expect(log).toContainText('attempt 3 (retry)',{timeout:15000});
  await page.locator('#msw-scenario-select').selectOption('success');
  await page.evaluate(async()=>{
    const modulePath='/src/api/rankingApi.ts';
    const {submitMatch}=await import(modulePath);
    const request={id:crypto.randomUUID(),playerId:crypto.randomUUID(),score:1,durationSeconds:60,endReason:'time_expired' as const,config:{sessionDurationSeconds:60,enemySpawnIntervalSeconds:3},playedAt:new Date().toISOString()};
    await submitMatch(request);await submitMatch(request);
  });
  await expect(log).toContainText('isDuplicate=true');
  await testInfo.attach('network-lab',{body:await page.screenshot(),contentType:'image/png'});
  await page.getByRole('button',{name:'Reset Mock DB'}).click();
  await expect(page.getByLabel('Network seed',{exact:true})).toHaveValue('1337');
});
