import {_android} from 'playwright';
import {expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';

// Run a booted Android Studio AVD with Chrome and `adb reverse tcp:5174 tcp:5174`.
// Uses Chrome on Android, not desktop viewport emulation. No match is submitted.
const serial=process.env.ANDROID_SERIAL || 'emulator-5554';
const directory=new URL('../docs/media/',import.meta.url);
await mkdir(directory,{recursive:true});
_android.setDefaultTimeout(45000);
const device=(await _android.devices({omitDriverInstall:true})).find(d=>d.serial()===serial);
if(!device) throw new Error(`No booted Android device ${serial}.`);
let context;
try {
  context=await device.launchBrowser({viewport:null});
  context.setDefaultTimeout(45000);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/match',route=>route.abort());
  await page.goto(process.env.ANDROID_GAME_URL || 'http://127.0.0.1:5174');
  await page.getByTestId('btn-set-sail').click();
  await page.waitForFunction(()=>window.__PIXI_GAME__?.isRunning);
  const session=await context.newCDPSession(page);
  await page.evaluate(()=>{window.__TOUCH_LOG__=[];for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture'])window.addEventListener(type,e=>window.__TOUCH_LOG__.push({type,id:e.pointerId,x:e.clientX,y:e.clientY,label:e.target.closest('button')?.ariaLabel}));});
  const observations=[];
  for(const orientation of ['portrait','landscape']) {
    await device.shell('settings put system accelerometer_rotation 0');
    await device.shell(`settings put system user_rotation ${orientation==='portrait'?0:1}`);
    await page.waitForFunction(portrait=>(innerWidth<innerHeight)===portrait,orientation==='portrait');
    await page.waitForTimeout(1500);
    if(await page.getByRole('dialog').isVisible()) await page.getByRole('button',{name:'Resume Battle',exact:true}).click();
    const before=await page.evaluate(()=>({tick:window.__PIRATE_SIMULATION__.tickCount,shots:window.__PIRATE_SIMULATION__.entityCounters.projectile}));
    const touches=[];
    for(const [id,name] of ['Move forward','Steer right','Fire front cannon'].entries()) {
      const rect=await page.getByRole('button',{name,exact:true}).boundingBox();
      if(!rect) throw new Error(`Missing ${name}`);
      const height=await page.evaluate(()=>innerHeight);
      expect(rect.y+rect.height).toBeLessThanOrEqual(height);
      touches.push({id,x:rect.x+rect.width/2,y:rect.y+rect.height/2});
    }
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touches});
    await page.waitForFunction(()=>window.__PIRATE_SIMULATION__.entityCounters.projectile > 0 && Math.hypot(window.__PIRATE_SIMULATION__.player.kinematic.velocityX,window.__PIRATE_SIMULATION__.player.kinematic.velocityY) > 0);
    const held=await page.evaluate(()=>{
      const sim=window.__PIRATE_SIMULATION__,g=window.__PIXI_GAME__;
      return {input:sim.currentInput,speed:Math.hypot(sim.player.kinematic.velocityX,sim.player.kinematic.velocityY),rotation:sim.player.kinematic.rotation,tick:sim.tickCount,paused:sim.isPaused,shots:sim.entityCounters.projectile,camera:g.camera,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},pointer:matchMedia('(any-pointer:coarse)').matches};
    });
    await page.screenshot({path:new URL(`android-${orientation}.png`,directory).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
    console.log(JSON.stringify({orientation,touches,held,events:await page.evaluate(()=>window.__TOUCH_LOG__)},null,2));
    expect(held.input).toMatchObject({throttle:1,steer:1,fireFront:true});
    expect(held.speed).toBeGreaterThan(0);expect(held.tick).toBeGreaterThan(before.tick);expect(held.shots).toBeGreaterThan(before.shots);
    expect(held.camera.portrait).toBe(orientation==='portrait');expect(held.pointer).toBe(true);
    await page.screenshot({path:new URL(`android-${orientation}.png`,directory).pathname.replace(/^\/([A-Za-z]:)/,'$1')});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[touches[2]]});
    await expect.poll(()=>page.evaluate(()=>window.__PIRATE_SIMULATION__.currentInput.fireFront)).toBe(false);
    const partial=await page.evaluate(()=>window.__PIRATE_SIMULATION__.currentInput);
    expect(partial).toMatchObject({throttle:1,steer:1,fireFront:false});
    await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    await expect.poll(()=>page.evaluate(()=>window.__PIRATE_SIMULATION__.currentInput.throttle)).toBe(0);
    observations.push({orientation,before,held,partial});
  }
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  const tick=await page.evaluate(()=>window.__PIRATE_SIMULATION__.tickCount);
  await page.waitForTimeout(500);expect(await page.evaluate(()=>window.__PIRATE_SIMULATION__.tickCount)).toBe(tick);
  await page.getByRole('button',{name:'Resume Battle',exact:true}).click();
  expect(await page.evaluate(()=>window.__PIRATE_SIMULATION__.currentInput.throttle)).toBe(0);
  expect(errors).toEqual([]);
  const report={recordedAt:new Date().toISOString(),avd:process.env.ANDROID_AVD || 'PirateBattle_Pixel5_API35',serial,model:device.model(),android:(await device.shell('getprop ro.build.version.release')).toString().trim(),userAgent:await page.evaluate(()=>navigator.userAgent),method:'Android Studio AVD, Chrome for Android, real OS orientation and coarse-pointer viewport. Three simultaneous browser touch pointers via CDP; individual release, cancel and pause/resume. Virtual device, not physical-phone evidence.',observations,errors};
  await writeFile(new URL('android-qa.json',directory),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  await device.shell('settings put system user_rotation 0').catch(()=>{});
  await context?.close();await device.close();
}
