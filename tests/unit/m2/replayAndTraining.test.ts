import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import { stateHash } from '../../../src/core/simulation/Replay';
import { combatCamera, edgeIndicator, interpolateTransform } from '../../../src/pixi/Camera';
import { createKinematicState } from '../../../src/core/kinematics/ShipKinematics';
import { ChaserAI } from '../../../src/core/ai/ChaserAI';
import { ShooterAI } from '../../../src/core/ai/ShooterAI';
import { DEFAULT_ARENA_CONFIG } from '../../../src/types';

function battle(seed: number) {
  const sim=new GameSimulation({sessionDurationSeconds:60},seed);
  while (!sim.isEnded) {
    if (sim.tickCount % 120 === 0) sim.setInputs({throttle:1,steer:sim.tickCount%360===0?.5:-.3,fireFront:true,fireBroadsideLeft:true});
    if (sim.tickCount === 400) {sim.pause();sim.update(5);sim.resume();}
    if (sim.tickCount === 620) {sim.setInputs({fireBroadsideRight:true},'touch');sim.setInputs({fireBroadsideRight:false},'touch');}
    sim.step(sim.fixedTimestep);
  }
  return sim;
}

describe('Battle replay',()=>{
  it.each([42,1337,17845])('reproduces seed %i at 144 Hz after other simulations allocated IDs',seed=>{
    const original=battle(seed),replay=original.getReplay()!;
    const noise=new GameSimulation(undefined,987);
    noise.setInputs({fireFront:true});noise.update(.2);noise.destroy();
    const playback=new GameSimulation(undefined,undefined,{replay});
    playback.setInputs({steer:1,fireFront:true}); // live controls are ignored
    let frames=0;
    while (!playback.isEnded && frames++<30000) {
      if (frames===200) {playback.pause();playback.update(1);playback.resume();}
      playback.update(1/144);
    }
    expect(playback.replayError).toBeNull();
    expect(playback.replayStatus).toBe('verified');
    expect(stateHash(playback)).toBe(stateHash(original));
    expect(replay.checks.length).toBeGreaterThan(1);
    original.destroy();playback.destroy();
  });
  it('detects divergence at the first periodic checkpoint and rejects incompatible versions',()=>{
    const original=battle(42),replay=original.getReplay()!;
    replay.inputs[0]!.input.throttle=0;
    const sim=new GameSimulation(undefined,undefined,{replay});
    for(let i=0;i<120;i++) sim.step(sim.fixedTimestep);
    expect(sim.replayStatus).toBe('diverged');expect(sim.replayError).toContain('120');
    expect(()=>new GameSimulation(undefined,undefined,{replay:{...replay,version:'old'} as any})).toThrow('incompatible');
    original.destroy();sim.destroy();
  });
  it('restarts the seed, configuration, counters, and recording together',()=>{
    const sim=battle(42);sim.restart({sessionDurationSeconds:60});
    const fresh=new GameSimulation(sim.config,42);
    for(let i=0;i<240;i++) {sim.step(sim.fixedTimestep);fresh.step(fresh.fixedTimestep);}
    expect(stateHash(sim)).toBe(stateHash(fresh));sim.destroy();fresh.destroy();
  });
});

it('teaches three real actions without opponents, a timer, a scored result, or a replay',()=>{
  const sim=new GameSimulation(undefined,42,{mode:'training'});
  sim.setInputs({throttle:1});
  while(sim.trainingStage==='move') sim.step(sim.fixedTimestep);
  sim.setInputs({fireFront:true});
  while(sim.trainingStage==='front') sim.step(sim.fixedTimestep);
  sim.setInputs({fireBroadsideLeft:true});
  for(let i=0;i<180 && sim.trainingStage!=='complete';i++) sim.step(sim.fixedTimestep);
  expect(sim.trainingStage).toBe('complete');expect(sim.score).toBe(0);
  expect(sim.remainingSeconds).toBe(sim.durationSeconds);expect(sim.getReplay()).toBeNull();sim.destroy();
});

it('interpolates on the shortest arc, clamps catch-up alpha, and leaves physics untouched',()=>{
  const k={...createKinematicState(20,40,-Math.PI+.1),prevX:10,prevY:20,prevRotation:Math.PI-.1};
  const saved={...k};const mid=interpolateTransform(k,.5);
  expect(mid.x).toBe(15);expect(mid.y).toBe(30);expect(Math.abs(mid.rotation)).toBeCloseTo(Math.PI);
  expect(interpolateTransform(k,9).x).toBe(20);expect(k).toEqual(saved);
});

it('recovers each practice lesson with clean inputs, cooldowns, and no scored recording',()=>{
  const sim = new GameSimulation(undefined, 42, {mode:'training'});
  sim.setInputs({throttle:1,steer:1});
  for(let i=0;i<30;i++) sim.step(sim.fixedTimestep);
  sim.resetTrainingLesson();
  expect(sim.player.kinematic.rotation).toBe(0);
  sim.setInputs({throttle:1});
  for(let i=0;i<300 && sim.trainingStage==='move';i++) sim.step(sim.fixedTimestep);
  expect(sim.trainingStage).toBe('front');
  sim.setInputs({throttle:1,steer:1});
  for(let i=0;i<40;i++) sim.step(sim.fixedTimestep);
  sim.setInputs({fireFront:true});sim.step(sim.fixedTimestep);
  sim.resetTrainingLesson();
  expect(sim.trainingStage).toBe('front');
  expect(sim.projectiles).toHaveLength(0);
  expect(sim.weaponSystem.cooldownFront).toBe(0);
  expect(sim.enemies[0]!.health).toBe(sim.enemies[0]!.maxHealth);
  expect(sim.player.kinematic.x).toBe(sim.config.arena.width*.5);
  sim.setInputs({fireFront:true});
  for(let i=0;i<180 && sim.trainingStage==='front';i++) sim.step(sim.fixedTimestep);
  expect(sim.trainingStage).toBe('broadside');
  sim.resetTrainingLesson();
  sim.setInputs({fireBroadsideLeft:true});
  for(let i=0;i<180 && sim.trainingStage!=='complete';i++) sim.step(sim.fixedTimestep);
  expect(sim.trainingStage).toBe('complete');
  expect(sim.score).toBe(0);expect(sim.getReplay()).toBeNull();
  sim.destroy();
});

it('gives portrait ships usable scale and clamps bearings above touch controls',()=>{
  const c=combatCamera(393,851,DEFAULT_ARENA_CONFIG,{x:800,y:800});
  expect(c.scale*70).toBeGreaterThan(49);expect(c.portrait).toBe(true);
  for(const y of [0,1000]) {
    const edgeCamera=combatCamera(393,851,DEFAULT_ARENA_CONFIG,{x:800,y});
    const screenY=y*edgeCamera.scale+edgeCamera.y;
    expect(screenY).toBeGreaterThanOrEqual(128);
    expect(screenY).toBeLessThanOrEqual(676);
  }
  const marker=edgeIndicator({x:196,y:680},{x:-100,y:1000},393,851)!;
  expect(marker.x).toBeGreaterThanOrEqual(24);expect(marker.y).toBeLessThanOrEqual(676);
  expect(combatCamera(851,393,DEFAULT_ARENA_CONFIG,{x:800,y:800}).portrait).toBe(false);
});

it('warns before a charge, then locks its bearing, and cancels shooter loading when aim is lost',()=>{
  const player=createKinematicState(500,200);
  const chaser=ChaserAI.create(500,480);
  ChaserAI.update(chaser,player,[],1/60);expect(chaser.chargeStage).toBe('loading');
  for(let i=0;i<34;i++) ChaserAI.update(chaser,player,[],1/60);
  expect(chaser.chargeStage).toBe('charging');
  const heading=chaser.chargeHeading;player.x=800;
  ChaserAI.update(chaser,player,[],1/60);expect(chaser.chargeHeading).toBe(heading);
  const shooter=ShooterAI.create(500,500);shooter.cooldownFront=0;player.x=500;
  ShooterAI.update(shooter,player,[],.2);expect(shooter.attackWindup).toBeCloseTo(.2);
  player.x=1100;ShooterAI.update(shooter,player,[],1/60);expect(shooter.attackWindup).toBe(0);
});
