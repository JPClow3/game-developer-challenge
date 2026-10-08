import { SeededPRNG } from '../spawner/EnemySpawner';
import type { GameSimulation } from './GameSimulation';

export interface RepairPickup { id: number; x: number; y: number; remainingSeconds: number }
export class RepairSalvage {
  public items: RepairPickup[] = [];
  public random: SeededPRNG;
  private nextId=0;
  constructor(seed: number) { this.random=new SeededPRNG(seed ^ 0x51a7); }
  public drop(sim: GameSimulation, position: {x:number;y:number}): void {
    if(!sim.config.voyage || this.items.length>=6)return;
    const chance=(sim.player.health/sim.player.maxHealth<=.5?.7:.35)*
      (sim.config.voyage.difficulty==='calm'?1.35:sim.config.voyage.difficulty==='storm'?.8:1);
    if(this.random.next()>chance)return;
    const pickup={id:++this.nextId,x:position.x,y:position.y,remainingSeconds:12};
    this.items.push(pickup);sim.emit('salvage_dropped',pickup);
  }
  public step(sim: GameSimulation, dt: number): void {
    for(const pickup of this.items) {
      pickup.remainingSeconds-=dt;
      if(pickup.remainingSeconds<=0 || sim.player.health>=sim.player.maxHealth)continue;
      if(Math.hypot(pickup.x-sim.player.kinematic.x,pickup.y-sim.player.kinematic.y)>45)continue;
      const healing=Math.min(20,sim.player.maxHealth-sim.player.health);
      sim.player.health+=healing;sim.stats.repairsCollected++;sim.stats.healthRestored+=healing;
      pickup.remainingSeconds=0;sim.emit('salvage_collected',{...pickup,healing});
      sim.emit('health_changed',{current:sim.player.health,max:sim.player.maxHealth,percentage:sim.player.health/sim.player.maxHealth*100});
    }
    this.items=this.items.filter(pickup=>pickup.remainingSeconds>0);
  }
}
