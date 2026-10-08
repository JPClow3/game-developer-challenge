import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import { ChaserAI } from '../../../src/core/ai/ChaserAI';
import { ShooterAI } from '../../../src/core/ai/ShooterAI';
import { clearSeaLine, NavigationField } from '../../../src/core/ai/NavigationField';
import { voyageGameplayConfig, voyageObstacles, voyagePressure, MAPS, DIFFICULTIES } from '../../../src/core/simulation/VoyageRules';
import { battleReport } from '../../../src/core/simulation/BattleReport';
import { DEFAULT_ARENA_CONFIG } from '../../../src/types/config';
import { createKinematicState } from '../../../src/core/kinematics/ShipKinematics';
import { CollisionSystem, getShipDualDiskCollider } from '../../../src/core/collision/CollisionSystem';

describe('voyage rules and deterministic playback',()=>{
  it.each(MAPS)('provides a distinct clear-start map: %s',map=>{
    const sim=new GameSimulation(voyageGameplayConfig(60,3,{difficulty:'open',map}),42);
    expect(sim.obstacles).toEqual(voyageObstacles(map));
    expect(sim.obstacles.every(obs=>Math.hypot(obs.x-sim.player.kinematic.x,obs.y-sim.player.kinematic.y)>obs.radius+32)).toBe(true);
    sim.destroy();
  });
  it.each(DIFFICULTIES)('replays a complete %s battle including salvage RNG',difficulty=>{
    const sim=new GameSimulation(voyageGameplayConfig(60,3,{difficulty,map:'archipelago'}),42);
    sim.setInputs({throttle:1,steer:.3,fireFront:true,fireBroadsideLeft:true,fireBroadsideRight:true});
    while(!sim.isEnded)sim.step(sim.fixedTimestep);
    const replay=sim.getReplay()!;
    expect(replay.version).toBe('pirate-battle-3');
    const playback=new GameSimulation(undefined,undefined,{replay});
    while(!playback.isEnded)playback.update(1/144);
    expect(playback.replayStatus).toBe('verified');
    expect(playback.stats).toEqual(sim.stats);
    sim.destroy();playback.destroy();
  });
  it('ram damage respects the selected difficulty',()=>{
    const sim=new GameSimulation(voyageGameplayConfig(60,3,{difficulty:'calm',map:'archipelago'}),4);
    sim.enemies=[ChaserAI.create(sim.player.kinematic.x,sim.player.kinematic.y)];
    sim.step(sim.fixedTimestep);
    expect(sim.player.health).toBe(100-sim.config.chaser.rammingDamage);
    expect(sim.score).toBe(0);expect(sim.stats.damageTaken).toBe(sim.config.chaser.rammingDamage);
    sim.destroy();
  });
  it('pressure grows without exceeding the preset cap',()=>{
    expect(voyagePressure(0,120,10)).toMatchObject({cap:3,intervalScale:1.35,shooterShare:.25});
    expect(voyagePressure(120,120,10)).toMatchObject({cap:10,shooterShare:.6});
    expect(voyagePressure(120,120,10).intervalScale).toBeCloseTo(.75);
  });
});

describe('repair salvage decisions',()=>{
  it('heals once, records actual healing, and stays frozen during pause',()=>{
    const sim=new GameSimulation(voyageGameplayConfig(60,3,{difficulty:'open',map:'archipelago'}),2);
    sim.player.health=90;
    sim.salvage.items=[{id:1,x:sim.player.kinematic.x,y:sim.player.kinematic.y,remainingSeconds:12}];
    sim.pause();sim.update(1);expect(sim.player.health).toBe(90);expect(sim.salvage.items[0]!.remainingSeconds).toBe(12);
    sim.resume();sim.step(sim.fixedTimestep);
    expect(sim.player.health).toBe(100);expect(sim.stats.healthRestored).toBe(10);expect(sim.stats.repairsCollected).toBe(1);
    expect(sim.salvage.items).toHaveLength(0);sim.step(sim.fixedTimestep);expect(sim.stats.repairsCollected).toBe(1);
    sim.destroy();
  });
  it('leaves salvage for a full-health captain and expires it after twelve active seconds',()=>{
    const sim=new GameSimulation(voyageGameplayConfig(60,15,{difficulty:'calm',map:'straits'}),2);
    sim.salvage.items=[{id:1,x:sim.player.kinematic.x,y:sim.player.kinematic.y,remainingSeconds:12}];
    sim.step(sim.fixedTimestep);expect(sim.salvage.items).toHaveLength(1);
    for(let i=0;i<720;i++)sim.step(sim.fixedTimestep);
    expect(sim.salvage.items).toHaveLength(0);expect(sim.stats.repairsCollected).toBe(0);sim.destroy();
  });
});

describe('navigation and fair shots',()=>{
  it('routes around land rather than steering straight into it',()=>{
    const obstacles=[{id:'rock',x:800,y:500,radius:120,tileIds:[]}];
    const field=new NavigationField(DEFAULT_ARENA_CONFIG,obstacles);
    const from={x:550,y:500},target={x:1050,y:500};
    expect(clearSeaLine(from,target,obstacles)).toBe(false);
    const next=field.waypoint(from,target);
    expect(next).not.toEqual(target);expect(clearSeaLine(from,next,obstacles,31)).toBe(true);
    const ship=ChaserAI.create(from.x,from.y,Math.PI/2),player=createKinematicState(target.x,target.y,0);
    let closest=Infinity;
    for(let i=0;i<1200;i++){
      ChaserAI.update(ship,player,obstacles,1/60,DEFAULT_ARENA_CONFIG,undefined,field.waypoint(ship.kinematic,player));
      CollisionSystem.resolveShipObstacleCollisions(ship.kinematic,obstacles);
      closest=Math.min(closest,Math.hypot(ship.kinematic.x-target.x,ship.kinematic.y-target.y));
      const hull=getShipDualDiskCollider(ship.kinematic);
      for(const disk of [hull.disk1,hull.disk2])expect(Math.hypot(disk.x-800,disk.y-500)).toBeGreaterThanOrEqual(136-1e-6);
    }
    expect(closest).toBeLessThan(100);
  });
  it('a loaded shooter does not discharge through an island',()=>{
    const obstacles=[{id:'rock',x:800,y:500,radius:55,tileIds:[]}];
    const shooter=ShooterAI.create(670,500,Math.PI/2),player=createKinematicState(930,500,0);
    shooter.cooldownFront=0;
    const field=new NavigationField(DEFAULT_ARENA_CONFIG,obstacles);
    for(let i=0;i<15;i++)expect(ShooterAI.update(shooter,player,obstacles,1/60,DEFAULT_ARENA_CONFIG,undefined,field.waypoint(shooter.kinematic,player))).toBeNull();
  });
  it('leads a moving target while still completing the visible windup',()=>{
    const shooter=ShooterAI.create(800,700,0),player=createKinematicState(800,410,0);
    player.velocityX=70;shooter.cooldownFront=0;
    let shot=null,ticks=0;
    for(;ticks<100&&!shot;ticks++) shot=ShooterAI.update(shooter,player,[],1/60,DEFAULT_ARENA_CONFIG,undefined,player);
    expect(shot).not.toBeNull();expect(ticks).toBeGreaterThanOrEqual(27);expect(shot!.vx).toBeGreaterThan(10);
  });
  it('the report cannot claim more than 100 percent accuracy',()=>{
    const report=battleReport({shotsFired:10,hits:7,chasersSunk:3,shootersSunk:2,damageTaken:40,repairsCollected:1,healthRestored:20},5,80,100,true);
    expect(report.accuracy).toBe(70);expect(report.stats.damageTaken).toBe(40);expect(report.grade).toBe('B');
  });
});
