import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';

// Run against `npm run preview -- --host 127.0.0.1 --port 4173` after building.
const baseURL = process.env.PROFILE_URL || 'http://127.0.0.1:4173';
const output = process.env.PROFILE_OUTPUT || 'test-results/combat-profile.json';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: {width:1280,height:720}, deviceScaleFactor:1 });
  const page = await context.newPage();
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  // This diagnostic never submits its artificially protected captain to a backend.
  await page.route('**/api/match', route=>route.abort());
  await page.addInitScript(() => localStorage.setItem('pirate_battle_user_config_v1',JSON.stringify({sessionDurationSeconds:180,spawner:{spawnIntervalSeconds:1}})));
  await page.goto(baseURL);
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(()=>window.__PIXI_GAME__?.isRunning);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap=async()=> {
    await cdp.send('HeapProfiler.collectGarbage');
    const metrics=(await cdp.send('Performance.getMetrics')).metrics;
    const dom=await cdp.send('Memory.getDOMCounters');
    return {heapBytes:metrics.find(m=>m.name==='JSHeapUsedSize')?.value,...dom};
  };
  const baseline=await heap();
  console.log('Profiling optimized combat for 180 seconds.');
  const combat=await page.evaluate(async()=>{
    const sim=window.__PIRATE_SIMULATION__;
    const frames=[];let peakEnemies=0,peakProjectiles=0,last=performance.now();
    const started=last;
    sim.player.maxHealth=10000;sim.player.health=10000;
    return new Promise(resolve=>{
      const sample=now=>{
        frames.push(now-last);last=now;
        peakEnemies=Math.max(peakEnemies,sim.enemies.length);
        peakProjectiles=Math.max(peakProjectiles,sim.projectiles.length);
        if(now-started>=180000 || sim.isEnded){
          const sorted=frames.slice(120).sort((a,b)=>a-b);
          const mean=sorted.reduce((sum,value)=>sum+value,0)/sorted.length;
          resolve({wallSeconds:(now-started)/1000,activeSeconds:sim.elapsedSeconds,frames:frames.length,fps:1000/mean,p95FrameMs:sorted[Math.floor(sorted.length*.95)],peakEnemies,peakProjectiles,reason:sim.endReason,isPaused:sim.isPaused});
          return;
        }
        sim.player.health=10000;
        sim.setInputs({throttle:1,steer:Math.sin(sim.elapsedSeconds*.18)*.8,fireFront:true,fireBroadsideLeft:true,fireBroadsideRight:true},'profile');
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  console.log('Combat measurement complete:',JSON.stringify(combat));
  if(await page.getByTestId('game-active-arena').isVisible()){
    await page.getByRole('button',{name:'Pause game',exact:true}).click();
    await page.getByRole('button',{name:/abandon match/i}).click();
  }else await page.getByRole('button',{name:'Main Menu',exact:true}).click();
  const cycles=[];
  for(let cycle=1;cycle<=5;cycle++){
    await page.getByTestId('btn-set-sail').click();
    await page.waitForFunction(()=>window.__PIXI_GAME__?.isRunning);
    await page.keyboard.down('w');await page.keyboard.down('Space');
    await page.waitForTimeout(2200);
    await page.keyboard.up('w');await page.keyboard.up('Space');
    await page.getByRole('button',{name:'Pause game',exact:true}).click();
    await page.getByRole('button',{name:/abandon match/i}).click();
    await page.waitForTimeout(200);
    cycles.push({cycle,...await heap(),canvasCount:await page.locator('canvas').count(),pixiAttached:await page.evaluate(()=>!!window.__PIXI_GAME__)});
  }
  const report={recordedAt:new Date().toISOString(),platform:os.platform(),cpu:os.cpus()[0].model,totalMemoryGB:os.totalmem()/1024**3,browser:browser.version(),baseURL,viewport:{width:1280,height:720,dpr:1},configuration:{sessionSeconds:180,spawnSeconds:1},method:'Headless optimized build. Scripted movement and all batteries held. Diagnostic hull protection. rAF sampling, first 120 frames excluded. Five 2.2-second play/abandon cycles with forced GC.',baseline,combat,cycles,errors};
  await mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2));
  console.log('Saved',output);
  if(errors.length || combat.isPaused || combat.wallSeconds<179) process.exitCode=1;
} finally { await browser.close(); }
