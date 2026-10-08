import { test, expect } from './fixtures';

test('voyage choices persist and produce a combat report and scoped ranking',async({page},info)=>{
  await page.goto('/');await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByLabel('Voyage difficulty')).toHaveValue('open');
  await page.getByLabel('Voyage difficulty').selectOption('calm');
  await page.getByLabel('Voyage map').selectOption('fortress');
  await page.reload();await expect(page.getByLabel('Voyage map')).toHaveValue('fortress');
  await page.getByTestId('btn-set-sail').click();await page.waitForFunction(()=> (window as any).__PIXI_GAME__?.isReady);
  await page.evaluate(()=>{
    const game=(window as any).__PIXI_GAME__,sim=(window as any).__PIRATE_SIMULATION__;
    game.app.ticker.stop();sim.resume();sim.setInputs({throttle:1,steer:.18,fireFront:true,fireBroadsideLeft:true});
    for(let i=0;i<300;i++)sim.step(sim.fixedTimestep);game.renderFrame(.1);game.app.render();
  });
  await info.attach('fortress-battle',{body:await page.screenshot({path:info.outputPath('voyage.png')}),contentType:'image/png'});
  expect(await page.evaluate(()=> (window as any).__PIRATE_SIMULATION__.config.voyage)).toEqual({difficulty:'calm',map:'fortress'});
  await page.evaluate(()=>{const sim=(window as any).__PIRATE_SIMULATION__;while(!sim.isEnded)sim.step(sim.fixedTimestep);});
  await expect(page.getByRole('region',{name:'Combat report'})).toBeVisible();
  await expect(page.getByText(/Your title:/)).toBeVisible();
  await expect(page.getByText(/Confirmed in Leaderboard/)).toBeVisible();
  await page.getByRole('button',{name:'Main Menu',exact:true}).click();
  await expect(page.getByText(/Personal best:/)).toBeVisible();
  await page.getByRole('tab',{name:'Ranking',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Calm waters · Fortress bay'})).toBeVisible();
  await expect(page.getByText('You',{exact:true})).toBeVisible();
});

test('joystick and cannon pointers work together and clear after pause',async({page,isMobile},info)=>{
  test.skip(!isMobile);await page.setViewportSize({width:915,height:412});
  await page.goto('/');await page.getByTestId('btn-options').click();
  await page.getByLabel('Use touch joystick').check();await page.getByRole('button',{name:'Save Options'}).click();
  await page.getByTestId('btn-set-sail').click();await page.waitForFunction(()=> (window as any).__PIXI_GAME__?.isReady);
  const joystick=page.getByTestId('touch-joystick');const box=(await joystick.boundingBox())!;
  const cannon=page.getByRole('button',{name:'Fire front cannon',exact:true});
  const gun=(await cannon.boundingBox())!;
  const touch=await page.context().newCDPSession(page);
  const helmPoint={id:11,x:box.x+box.width/2,y:box.y+15};
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[helmPoint]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[helmPoint,{id:12,x:gun.x+gun.width/2,y:gun.y+gun.height/2}]});
  await expect.poll(()=>page.evaluate(()=>({throttle:(window as any).__PIRATE_SIMULATION__.currentInput.throttle,fire:(window as any).__PIRATE_SIMULATION__.currentInput.fireFront}))).toEqual({throttle:1,fire:true});
  const camera=await page.evaluate(()=> (window as any).__PIXI_GAME__.camera);
  expect(camera.scale).toBeGreaterThanOrEqual(.7);expect(camera.follow).toBe(true);
  await info.attach('landscape-joystick',{body:await page.screenshot({path:info.outputPath('voyage.png')}),contentType:'image/png'});
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  await page.getByRole('button',{name:'Resume Battle',exact:true}).click();
  expect(await page.evaluate(()=>({throttle:(window as any).__PIRATE_SIMULATION__.currentInput.throttle,fire:(window as any).__PIRATE_SIMULATION__.currentInput.fireFront}))).toEqual({throttle:0,fire:false});
});

test('repair, foam and sinking visuals stay bounded without changing simulation state',async({page},info)=>{
  await page.goto('/');await page.getByTestId('btn-set-sail').click();await page.waitForFunction(()=> (window as any).__PIXI_GAME__?.isReady);
  const evidence=await page.evaluate(()=>{
    const game=(window as any).__PIXI_GAME__,sim=(window as any).__PIRATE_SIMULATION__;
    game.app.ticker.stop();sim.pause();sim.player.kinematic.velocityY=-150;
    sim.salvage.items.push({id:1,x:860,y:650,remainingSeconds:8});
    const enemy=sim.spawner.forceSpawn('shooter',950,720);sim.emit('ship_sunk',enemy);
    const before=JSON.stringify(sim.getDebugState());
    for(let i=0;i<100;i++)game.renderFrame(.02);game.app.render();
    return {same:before===JSON.stringify(sim.getDebugState()),foam:game.foam.length,debris:game.debris.length,salvage:game.salvageGraphics.context.instructions.length};
  });
  expect(evidence.same).toBe(true);expect(evidence.foam).toBeLessThanOrEqual(160);expect(evidence.debris).toBeGreaterThan(0);expect(evidence.salvage).toBeGreaterThan(0);
  await info.attach('salvage-and-aftermath',{body:await page.screenshot({path:info.outputPath('voyage.png')}),contentType:'image/png'});
});
