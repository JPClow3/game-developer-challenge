import { chromium } from 'playwright';
import { mkdir, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// Start npm run dev first. Uses local MSW; no live match is submitted.
const output = new URL('../docs/media/', import.meta.url);
await mkdir(output, {recursive:true});
const browser = await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL || undefined});
try {
  const context = await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:'test-results/gameplay-video',size:{width:1280,height:720}}});
  const page = await context.newPage();
  await page.route('**/api/match',route=>route.abort());
  await page.goto(process.env.GAMEPLAY_URL || 'http://127.0.0.1:5173');
  await page.getByRole('button',{name:/Practice voyage/}).click();
  await page.waitForFunction(()=>window.__PIXI_GAME__?.isRunning);
  await page.keyboard.down('w');await page.getByRole('status').filter({hasText:'2 / 3'}).waitFor();await page.keyboard.up('w');
  await page.keyboard.press('Space');await page.getByRole('status').filter({hasText:'3 / 3'}).waitFor();
  await page.keyboard.press('q');await page.getByRole('status').filter({hasText:'Ready for the high seas'}).waitFor();
  await page.waitForTimeout(600);
  await page.getByRole('button',{name:'Back to harbor',exact:true}).click();
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(()=>window.__PIXI_GAME__?.isRunning && window.__PIRATE_SIMULATION__.mode==='match');
  await page.keyboard.down('w');await page.keyboard.down('Space');
  for (let i=0;i<6;i++) {
    const key=i%2?'a':'d';await page.keyboard.down(key);await page.keyboard.press(i%2?'q':'e');
    await page.waitForTimeout(1800);await page.keyboard.up(key);
    if(await page.getByTestId('result-screen').isVisible()) break;
  }
  await page.keyboard.up('w');await page.keyboard.up('Space');
  if(await page.getByTestId('game-active-arena').isVisible()) {
    await page.screenshot({path:new URL('battle-desktop.png',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
    // Fast-forward the ending with unchanged fixed ticks, then demonstrate its replay.
    await page.evaluate(()=>{const g=window.__PIXI_GAME__;g.app.ticker.stop();while(!g.simulation.isEnded)g.simulation.step(g.simulation.fixedTimestep);});
  }
  await page.getByRole('button',{name:'Watch Replay',exact:true}).click();
  await page.waitForFunction(()=>window.__PIXI_GAME__?.isRunning && window.__PIRATE_SIMULATION__.mode==='replay');
  await page.waitForTimeout(3000);
  await page.evaluate(()=>{const g=window.__PIXI_GAME__;g.app.ticker.stop();while(!g.simulation.isEnded)g.simulation.step(g.simulation.fixedTimestep);g.renderFrame();g.app.render();});
  await page.getByRole('status').filter({hasText:'Replay verified'}).waitFor();
  await page.waitForTimeout(1500);
  const video=page.video();await context.close();
  await copyFile(await video.path(),new URL('gameplay.webm',output));
  const conversion=spawnSync('ffmpeg',['-y','-i',new URL('gameplay.webm',output).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'-c:v','libx264','-crf','28','-pix_fmt','yuv420p','-movflags','+faststart',new URL('gameplay.mp4',output).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{stdio:'ignore'});
  if(conversion.status!==0) throw new Error('Video recorded as WebM. ffmpeg is required for the MP4 export.');
  console.log('Saved docs/media/gameplay.mp4 (training, battle, verified replay).');
} finally {await browser.close();}
