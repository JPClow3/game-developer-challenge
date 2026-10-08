import { Container, Graphics, Text } from 'pixi.js';
import type { GameSimulation } from '../core/simulation/GameSimulation';
import { getShipDualDiskCollider } from '../core/collision/CollisionSystem';

/** Current physics coordinates deliberately bypass render interpolation. */
export class DebugOverlay extends Container {
  private geometry = new Graphics();
  private lifetimes = new Map<number, Text>();
  public counts = { shipDisks: 0, islands: 0, shooters: 0, projectiles: 0 };
  constructor() { super(); this.addChild(this.geometry); this.eventMode = 'none'; }
  update(sim: GameSimulation): void {
    const g = this.geometry.clear();
    const circle = (x:number,y:number,radius:number,color:number) => g.circle(x,y,radius).stroke({width:1.5,color,alpha:.85});
    const ships = [sim.player, ...sim.enemies].filter(ship=>!ship.isDestroyed);
    for (const ship of ships) {
      const collider = getShipDualDiskCollider(ship.kinematic);
      for (const disk of [collider.disk1,collider.disk2]) circle(disk.x,disk.y,disk.radius,0x4affce);
    }
    for (const island of sim.obstacles) circle(island.x,island.y,island.radius,0xffb84a);
    circle(sim.player.kinematic.x,sim.player.kinematic.y,sim.config.spawner.safePlayerDistance,0xffe65a);
    const shooters = sim.enemies.filter(ship=>ship.type==='shooter');
    for (const ship of shooters) for (const radius of [sim.config.shooter.engageMinDistance,sim.config.shooter.engageMaxDistance]) circle(ship.kinematic.x,ship.kinematic.y,radius,0xff80da);
    const active = new Set<number>();
    for (const shot of sim.projectiles) {
      circle(shot.x,shot.y,shot.radius,0xffffff); active.add(shot.id);
      let label=this.lifetimes.get(shot.id);
      if(!label) { label=new Text({text:'',style:{fontFamily:'monospace',fontSize:12,fill:0xffffff,stroke:{color:0x062432,width:3}}});this.lifetimes.set(shot.id,label);this.addChild(label); }
      label.text=`${shot.remainingLife.toFixed(2)}s`;label.position.set(shot.x+7,shot.y-12);
    }
    for (const [id,label] of this.lifetimes) if(!active.has(id)){label.destroy();this.lifetimes.delete(id);}
    this.counts={shipDisks:ships.length*2,islands:sim.obstacles.length,shooters:shooters.length,projectiles:active.size};
  }
}
