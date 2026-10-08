import {test,expect} from './fixtures';
import type { Page } from './fixtures';

async function running(page:Page) {await page.waitForFunction(() => (window as any).__PIXI_GAME__?.isRunning);}

test('training is playable, skippable, and never submits a scored match',async({page},testInfo)=>{
  const submissions:string[]=[];
  page.on('request',request=>{if(request.method()==='POST' && request.url().includes('/api/match')) submissions.push(request.url());});
  await page.goto('/');await page.getByRole('button',{name:/Practice voyage/}).click();await running(page);
  await expect(page.getByRole('status').filter({hasText:'1 / 3'})).toBeVisible();
  await page.keyboard.down('w');
  await expect(page.getByRole('status').filter({hasText:'2 / 3'})).toBeVisible();await page.keyboard.up('w');
  await page.keyboard.press('Space');
  await expect(page.getByRole('status').filter({hasText:'3 / 3'})).toBeVisible();
  await testInfo.attach('practice-target',{body:await page.screenshot(),contentType:'image/png'});
  await page.keyboard.press('q');
  await expect(page.getByRole('status').filter({hasText:'Ready for the high seas'})).toBeVisible();
  expect(await page.evaluate(()=> (window as any).__PIRATE_SIMULATION__.score)).toBe(0);
  await page.getByRole('button',{name:'Back to harbor',exact:true}).click();await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByRole('button',{name:/Practice voyage/}).click();await running(page);
  await page.getByRole('button',{name:'Skip training',exact:true}).click();
  await expect(page.getByTestId('main-menu')).toBeVisible();expect(submissions).toEqual([]);
});

test('Watch Replay reproduces a played battle and returns without another submission',async({page},testInfo)=>{
  let submissions=0;
  page.on('request',request=>{if(request.method()==='POST' && request.url().includes('/api/match')) submissions++;});
  await page.goto('/');await page.getByTestId('btn-set-sail').click();await running(page);
  await page.keyboard.down('w');await page.keyboard.down('Space');await page.keyboard.down('e');
  await page.waitForTimeout(300);
  await page.evaluate(()=>{
    const game=(window as any).__PIXI_GAME__,sim=game.simulation;
    game.app.ticker.stop();
    while(!sim.isEnded) sim.step(sim.fixedTimestep);
  });
  await page.keyboard.up('w');await page.keyboard.up('Space');await page.keyboard.up('e');
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await expect.poll(()=>submissions).toBe(1);
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('pirate_battle_last_completed_match_v1')!).replay);
  expect(original.checks.length).toBeGreaterThan(1);
  await page.reload();await page.goto('/#last-result');
  await page.getByRole('button',{name:'Watch Replay',exact:true}).click();await running(page);
  // Reloading a result may idempotently recover its original submission; playback must not add any.
  const before=submissions;
  await page.keyboard.press('a');
  await page.evaluate(()=>{
    const game=(window as any).__PIXI_GAME__,sim=game.simulation;game.app.ticker.stop();
    let ticks=0;while(!sim.isEnded && ticks++<11000) sim.step(sim.fixedTimestep);
    game.renderFrame();game.app.render();
  });
  await expect(page.getByRole('status').filter({hasText:'Replay verified'})).toBeVisible();
  await testInfo.attach('verified-replay',{body:await page.screenshot(),contentType:'image/png'});
  await page.getByRole('button',{name:'Back to results',exact:true}).click();
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await page.waitForTimeout(200);expect(submissions).toBe(before);
});

test('portrait camera follows at a readable scale with bearings and survives rotation',async({page,isMobile},testInfo)=>{
  test.skip(!isMobile);
  await page.goto('/');await page.getByTestId('btn-set-sail').click();await running(page);
  await page.evaluate(()=>{
    const game=(window as any).__PIXI_GAME__,sim=game.simulation;
    game.app.ticker.stop();sim.alpha=1;sim.enemies=[];
    sim.enemies.push(sim.spawner.forceSpawn('chaser',1400,200),sim.spawner.forceSpawn('shooter',200,350));
    game.renderFrame();game.app.render();
  });
  let camera=await page.evaluate(()=>({camera:(window as any).__PIXI_GAME__.camera,indicators:(window as any).__PIXI_GAME__.visibleIndicators}));
  expect(camera.camera.portrait).toBe(true);expect(camera.camera.scale*70).toBeGreaterThan(49);expect(camera.indicators.length).toBe(2);
  await testInfo.attach('portrait-camera',{body:await page.screenshot(),contentType:'image/png'});
  await page.setViewportSize({width:851,height:393});
  await expect.poll(() => page.evaluate(() => (window as any).__PIXI_GAME__.app.screen.width)).toBe(851);
  await page.evaluate(()=>{const g=(window as any).__PIXI_GAME__;g.renderFrame();g.app.render();});
  camera=await page.evaluate(()=>({camera:(window as any).__PIXI_GAME__.camera,indicators:(window as any).__PIXI_GAME__.visibleIndicators}));
  expect(camera.camera.portrait).toBe(false);expect(camera.camera.follow).toBe(true);expect(camera.camera.scale*70).toBeGreaterThanOrEqual(49);expect(camera.indicators.length).toBe(2);
  await expect(page.getByRole('button',{name:'Fire front cannon',exact:true})).toBeVisible();
});

test('three simultaneous real touch pointers steer, accelerate and fire independently',async({page,isMobile},testInfo)=>{
  test.skip(!isMobile);
  await page.goto('/');await page.getByTestId('btn-set-sail').click();await running(page);
  const session=await page.context().newCDPSession(page);
  const touches=[];
  for (const [id,name] of ['Move forward','Steer right','Fire front cannon'].entries()) {
    const bounds=(await page.getByRole('button',{name,exact:true}).boundingBox())!;
    touches.push({id,x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2});
  }
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});
  await page.waitForTimeout(400);
  const state=await page.evaluate(()=>{
    const sim=(window as any).__PIRATE_SIMULATION__;
    return {input:sim.currentInput,speed:Math.hypot(sim.player.kinematic.velocityX,sim.player.kinematic.velocityY),rotation:sim.player.kinematic.rotation,shots:sim.entityCounters.projectile};
  });
  expect(state.input.throttle).toBe(1);expect(state.input.steer).toBe(1);expect(state.input.fireFront).toBe(true);
  expect(state.speed).toBeGreaterThan(0);expect(state.rotation).toBeGreaterThan(0);expect(state.shots).toBeGreaterThan(0);
  await testInfo.attach('simultaneous-touch',{body:await page.screenshot(),contentType:'image/png'});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[touches[2]!]});
  await expect.poll(()=>page.evaluate(()=> (window as any).__PIRATE_SIMULATION__.currentInput.fireFront)).toBe(false);
  expect(await page.evaluate(()=> (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(1);
  await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await expect.poll(()=>page.evaluate(()=> (window as any).__PIRATE_SIMULATION__.currentInput.throttle)).toBe(0);
});

test('rendered transforms interpolate and enemy cues appear before attacks',async({page},testInfo)=>{
  await page.goto('/');await page.getByTestId('btn-set-sail').click();await running(page);
  const result=await page.evaluate(()=>{
    const g=(window as any).__PIXI_GAME__,s=g.simulation;g.app.ticker.stop();
    const k=s.player.kinematic;k.prevX=780;k.x=800;k.prevY=780;k.y=800;
    k.prevRotation=Math.PI-.1;k.rotation=-Math.PI+.1;s.alpha=.5;
    g.renderFrame();
    const pose={x:g.playerVisual.container.x,y:g.playerVisual.container.y,rotation:g.playerVisual.container.rotation};
    k.prevRotation=k.rotation=0;
    const shooter=s.spawner.forceSpawn('shooter',800,500);shooter.kinematic.rotation=Math.PI;shooter.cooldownFront=0;
    const chaser=s.spawner.forceSpawn('chaser',530,800);chaser.kinematic.rotation=Math.PI/2;
    s.enemies=[shooter,chaser];
    for(let i=0;i<15;i++)s.step(s.fixedTimestep);
    s.alpha=1;g.renderFrame();g.app.render();
    return {pose,loading:shooter.attackWindup,charge:chaser.chargeStage,draws:g.intentGraphics.context.instructions.length};
  });
  expect(result.pose.x).toBe(790);expect(result.pose.y).toBe(790);expect(Math.abs(result.pose.rotation)).toBeCloseTo(Math.PI);
  expect(result.loading).toBeGreaterThan(0);expect(result.charge).toBe('loading');expect(result.draws).toBeGreaterThan(0);
  await testInfo.attach('enemy-anticipation',{body:await page.screenshot(),contentType:'image/png'});
});
