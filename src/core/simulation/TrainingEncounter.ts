import type { GameSimulation } from './GameSimulation';
import { ShooterAI } from '../ai/ShooterAI';

/** Unscored movement and cannon lessons, independent of battle/replay rules. */
export class TrainingEncounter {
  public stage: 'move' | 'front' | 'broadside' | 'complete' = 'move';
  public advance(sim: GameSimulation): void {
    if (this.stage === 'move') {
      if (
        Math.hypot(
          sim.player.kinematic.x - sim.config.arena.width * 0.5,
          sim.player.kinematic.y - sim.config.arena.height * 0.8,
        ) < 70
      )
        return;
      this.stage = 'front';
      this.placeTarget(sim, false);
    } else if (
      this.stage === 'front' &&
      sim.enemies[0] &&
      sim.enemies[0].health < sim.enemies[0].maxHealth
    ) {
      this.stage = 'broadside';
      this.placeTarget(sim, true);
    } else if (this.stage === 'broadside' && sim.enemies[0]?.isDestroyed) {
      this.stage = 'complete';
      sim.enemies = [];
      sim.clearInputs();
    } else return;
    sim.emit('training_progress', this.stage);
  }

  private placeTarget(sim: GameSimulation, broadside: boolean): void {
    sim.player = sim.createPlayerShip();
    sim.projectiles = [];
    sim.weaponSystem.reset();
    sim.clearInputs();
    const k = sim.player.kinematic;
    const target = ShooterAI.create(k.x - (broadside ? 150 : 0), k.y - (broadside ? 0 : 180));
    target.id = 'practice_target';
    target.health = target.maxHealth = broadside ? 40 : 25;
    sim.enemies = [target];
  }

  /** Recover the current lesson after sailing past its target, without scoring. */
  public reset(sim: GameSimulation): void {
    if (sim.mode !== 'training' || sim.isPaused || sim.isEnded || this.stage === 'complete') return;
    if (this.stage === 'move') {
      sim.player = sim.createPlayerShip();
      sim.projectiles = [];
      sim.weaponSystem.reset();
      sim.clearInputs();
    } else {
      this.placeTarget(sim, this.stage === 'broadside');
    }
    sim.accumulator = 0;
    sim.alpha = 1;
    sim.emit('training_progress', this.stage);
  }
}
