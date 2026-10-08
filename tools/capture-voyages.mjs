import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Run against a local dev/test build. Controlled scenes are visual QA, not score proof.
const baseURL=process.env.VOYAGE_QA_URL ?? 'http://127.0.0.1:5321';
const output=resolve(process.env.VOYAGE_QA_OUTPUT ?? 'artifacts/voyage-qa');
await mkdir(output,{recursive:true});
const browser=await chromium.launch();
const evidence=[];
try {
  for(const [name,width,height,touch] of [['desktop',1280,720,false],['landscape',915,412,true],['portrait',393,851,true]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(baseURL);await page.getByTestId('main-menu').waitFor();
    await page.screenshot({path:resolve(output,`${name}-menu.png`)});
    for(const map of ['archipelago','straits','fortress']) {
      await page.getByLabel('Voyage difficulty').selectOption('open');
      await page.getByLabel('Voyage map').selectOption(map);
      await page.getByTestId('btn-set-sail').click();
      await page.waitForFunction(()=>window.__PIXI_GAME__?.isReady);
      const state=await page.evaluate(async()=> {
        const game=window.__PIXI_GAME__,sim=game.simulation;
        game.app.ticker.stop();sim.resume();
        sim.setInputs({throttle:1,steer:.2,fireFront:true,fireBroadsideLeft:true});
        for(let i=0;i<1200 && !sim.isEnded;i++)sim.step(sim.fixedTimestep);
        sim.pause();
        // An injured captain and a visible crate make the repair affordance reviewable.
        sim.player.health=65;
        sim.salvage.items.push({id:500,x:sim.player.kinematic.x+80,y:sim.player.kinematic.y-60,remainingSeconds:10});
        const wreck=sim.spawner.forceSpawn('shooter',sim.player.kinematic.x-100,sim.player.kinematic.y-50);
        sim.emit('ship_sunk',wreck);
        game.renderFrame(.08);game.app.render();
        const samples=[];
        for(let i=0;i<120;i++) {const start=performance.now();game.renderFrame(1/60);game.app.render();samples.push(performance.now()-start);}
        samples.sort((a,b)=>a-b);
        return {camera:game.camera,enemies:sim.enemies.length,indicators:game.visibleIndicators.length,foam:game.foam.length,debris:game.debris.length,
          renderMedianMs:samples[60],renderP95Ms:samples[114]};
      });
      // Hide the pause dialog only for this controlled image; the simulation remains paused.
      await page.getByRole('dialog').evaluate(dialog=>{dialog.style.display='none';});
      await page.screenshot({path:resolve(output,`${name}-${map}.png`)});
      evidence.push({viewport:name,map,...state,errors:[...errors]});
      await page.reload();await page.getByTestId('main-menu').waitFor();
    }
    await context.close();
  }
  await writeFile(resolve(output,'evidence.json'),JSON.stringify({recordedAt:new Date().toISOString(),baseURL,
    method:'Controlled local test scenes. Fixed ticks, injured captain, visible repair crate and sinking feedback; pause dialog hidden for the capture. Render submission timing ran alongside browser validation and is not frame-rate or physical-device acceptance.',scenes:evidence},null,2));
  if(evidence.some(entry=>entry.errors.length))throw new Error('Browser errors recorded; inspect evidence.json.');
  console.log(`Captured nine voyages in ${output}`);
} finally {await browser.close();}
