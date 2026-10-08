import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

// Run against `npm run preview -- --host 127.0.0.1 --port 4173` after building.
const baseURL = process.env.PROFILE_URL || 'http://127.0.0.1:4173';
const output = process.env.PROFILE_OUTPUT || 'test-results/combat-profile.json';
const durationSeconds = Number(process.env.PROFILE_SECONDS || 180);
const cycleCount = Number(process.env.PROFILE_CYCLES || 5);
const cycleSeconds = Number(process.env.PROFILE_CYCLE_SECONDS || 2.2);
const cpuRate = Number(process.env.PROFILE_CPU_RATE || 1);
if (![1,4].includes(cpuRate)) throw new Error('PROFILE_CPU_RATE must be 1 or 4');
const viewport={width:Number(process.env.PROFILE_WIDTH || 1280),height:Number(process.env.PROFILE_HEIGHT || 720)};
if (![viewport.width,viewport.height].every(value=>Number.isInteger(value) && value>=240 && value<=4096)) throw new Error('Use PROFILE_WIDTH/PROFILE_HEIGHT between 240 and 4096.');
if (!Number.isFinite(durationSeconds) || durationSeconds < 5 || !Number.isInteger(cycleCount) || cycleCount < 1 || !Number.isFinite(cycleSeconds) || cycleSeconds < .5 || cycleSeconds >= 180) throw new Error('Use PROFILE_SECONDS >= 5, PROFILE_CYCLES >= 1 and PROFILE_CYCLE_SECONDS from 0.5 to less than 180.');
const browser = await chromium.launch({ channel: process.env.PROFILE_CHANNEL || undefined, headless: true });
try {
  const browserCdp=await browser.newBrowserCDPSession();
  const {gpu}=await browserCdp.send('SystemInfo.getInfo');
  const context = await browser.newContext({ viewport, deviceScaleFactor:1 });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', {rate:cpuRate});
  const errors=[]; page.on('pageerror', error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error') errors.push(message.text());});
  // This diagnostic never submits its artificially protected captain to a backend.
  await page.route('**/api/match', route=>route.abort());
  // Production Classic now requests a server ticket. Supply a local diagnostic
  // ticket so profiling a static build neither needs nor creates a ranked session.
  const profilePlayerId=randomUUID();
  await page.route('**/api/session', route=>route.fulfill({
    status:201,contentType:'application/json',body:JSON.stringify({
      id:randomUUID(),playerId:profilePlayerId,seed:1337,config:route.request().postDataJSON(),
    }),
  }));
  await page.addInitScript(() => localStorage.setItem('pirate_battle_user_config_v1',JSON.stringify({sessionDurationSeconds:180,spawner:{spawnIntervalSeconds:1}})));
  await page.goto(baseURL);
  if (process.env.PROFILE_DIFFICULTY) {
    await page.getByLabel('Voyage difficulty').selectOption(process.env.PROFILE_DIFFICULTY);
    if (process.env.PROFILE_MAP) await page.getByLabel('Voyage map').selectOption(process.env.PROFILE_MAP);
  }
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(()=>window.__PIXI_GAME__?.isRunning);
  await cdp.send('Performance.enable');
  const heap=async()=> {
    await cdp.send('HeapProfiler.collectGarbage');
    const metrics=(await cdp.send('Performance.getMetrics')).metrics;
    const dom=await cdp.send('Memory.getDOMCounters');
    return {heapBytes:metrics.find(m=>m.name==='JSHeapUsedSize')?.value,...dom};
  };
  const baseline=await heap();
  // Weak references observe collection without retaining retired game instances.
  const trackGame=()=>page.evaluate(()=>{
    window.__PROFILE_RETIRED__ ??= [];
    window.__PROFILE_RETIRED__.push(Object.fromEntries([
      ['simulation',window.__PIRATE_SIMULATION__],['game',window.__PIXI_GAME__],
      ['application',window.__PIXI_GAME__.app],['canvas',document.querySelector('canvas')],
    ].map(([key,value])=>[key,new WeakRef(value)])));
  });
  const retained=()=>page.evaluate(()=>({
    ...Object.fromEntries(['simulation','game','application','canvas'].map(key=>[
      key,window.__PROFILE_RETIRED__.filter(refs=>refs[key].deref()!==undefined).length,
    ])),
    simulationIndices:window.__PROFILE_RETIRED__.flatMap((refs,index)=>refs.simulation.deref()!==undefined?[index]:[]),
  }));
  await trackGame();
  console.log(`Profiling optimized combat for ${durationSeconds} seconds.`);
  const combat=await page.evaluate(async(durationSeconds)=>{
    const sim=window.__PIRATE_SIMULATION__;
    const frames=[];let peakEnemies=0,peakProjectiles=0,peakEntities=0,last=performance.now();
    const started=last;
    sim.player.maxHealth=10000;sim.player.health=10000;
    return new Promise(resolve=>{
      const sample=now=>{
        frames.push(now-last);last=now;
        peakEnemies=Math.max(peakEnemies,sim.enemies.length);
        peakProjectiles=Math.max(peakProjectiles,sim.projectiles.length);
        peakEntities=Math.max(peakEntities,1+sim.obstacles.length+sim.enemies.length+sim.projectiles.length);
        if(sim.elapsedSeconds>=durationSeconds || sim.isEnded){
          const sorted=frames.slice(120).sort((a,b)=>a-b);
          const mean=sorted.reduce((sum,value)=>sum+value,0)/sorted.length;
          resolve({wallSeconds:(now-started)/1000,activeSeconds:sim.elapsedSeconds,frames:frames.length,fps:1000/mean,p95FrameMs:sorted[Math.floor(sorted.length*.95)],peakEnemies,peakProjectiles,peakEntities,voyage:sim.config.voyage ?? null,reason:sim.endReason,isPaused:sim.isPaused});
          return;
        }
        sim.player.health=10000;
        sim.setInputs({throttle:1,steer:Math.sin(sim.elapsedSeconds*.18)*.8,fireFront:true,fireBroadsideLeft:true,fireBroadsideRight:true},'profile');
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  }, durationSeconds);
  console.log('Combat measurement complete:',JSON.stringify(combat));
  if(await page.getByTestId('game-active-arena').isVisible()){
    await page.getByRole('button',{name:'Pause game',exact:true}).click();
    await page.getByRole('button',{name:/abandon match/i}).click();
  }else await page.getByRole('button',{name:'Main Menu',exact:true}).click();
  await page.waitForTimeout(200);
  const afterCombat={...await heap(),retained:await retained()};
  const cycles=[];
  for(let cycle=1;cycle<=cycleCount;cycle++){
    await page.getByTestId('btn-set-sail').click();
    await page.waitForFunction(()=>window.__PIXI_GAME__?.isRunning);
    await trackGame();
    await page.evaluate(()=>{window.__PIRATE_SIMULATION__.player.maxHealth=10000;window.__PIRATE_SIMULATION__.player.health=10000;});
    await page.keyboard.down('w');await page.keyboard.down('Space');
    await page.waitForTimeout(cycleSeconds*1000);
    await page.keyboard.up('w');await page.keyboard.up('Space');
    await page.getByRole('button',{name:'Pause game',exact:true}).click();
    await page.getByRole('button',{name:/abandon match/i}).click();
    await page.waitForTimeout(200);
    cycles.push({cycle,...await heap(),canvasCount:await page.locator('canvas').count(),pixiAttached:await page.evaluate(()=>!!window.__PIXI_GAME__),simulationAttached:await page.evaluate(()=>!!window.__PIRATE_SIMULATION__),retained:await retained()});
    console.log('Exit cycle:',JSON.stringify(cycles.at(-1)));
  }
  await page.waitForTimeout(10000);
  const afterIdle={...await heap(),retained:await retained()};
  const report={recordedAt:new Date().toISOString(),platform:os.platform(),cpu:os.cpus()[0].model,totalMemoryGB:os.totalmem()/1024**3,browser:browser.version(),browserChannel:process.env.PROFILE_CHANNEL || 'locked chromium headless shell',gpu,baseURL,viewport:{...viewport,dpr:1},cpuThrottlingRate:cpuRate,configuration:{sessionSeconds:180,spawnSeconds:1,seed:1337},method:`Headless optimized test-mode build (only test globals enabled). Local diagnostic session ticket, no ranked backend traffic. ${durationSeconds}-second simulation measurement. Scripted movement and all batteries held. Diagnostic hull protection. rAF sampling, first 120 frames excluded. ${cycleCount} ${cycleSeconds}-second play/abandon cycles with forced GC, then 10 seconds idle. Weak references track retired simulation, game, application and canvas objects. Simulation indices identify whether retention accumulates or replaces an earlier instance.`,baseline,combat,afterCombat,cycles,afterIdle,errors};
  await mkdir(dirname(output),{recursive:true});
  await writeFile(output,JSON.stringify(report,null,2));
  console.log('Saved',output);
  if(errors.length || combat.isPaused || combat.wallSeconds<durationSeconds-1 || cycles.some(cycle=>cycle.canvasCount!==0 || cycle.pixiAttached || cycle.simulationAttached)) process.exitCode=1;
} finally { await browser.close(); }
