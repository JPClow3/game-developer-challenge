import { describe, it, expect, afterEach } from 'vitest';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';

const simulations: GameSimulation[] = [];
const create = () => { const sim = new GameSimulation(undefined, 99); simulations.push(sim); return sim; };
afterEach(() => { for (const sim of simulations.splice(0)) sim.destroy(); });

describe('Independent keyboard and touch commands', () => {
  it('keeps keyboard thrust when a touch cannon is released', () => {
    const sim = create();
    sim.setInputs({ throttle: 1 }, 'keyboard');
    sim.setInputs({ fireFront: true }, 'touch');
    sim.step(1 / 60);
    expect(sim.projectiles).toHaveLength(1);
    sim.setInputs({ throttle: 0, fireFront: false }, 'touch');
    for (let i=0;i<20;i++) sim.step(1/60);
    expect(sim.player.kinematic.velocityY).toBeLessThan(-20);
  });
  it('combines opposite steering commands without exceeding the turn range', () => {
    const sim = create();
    sim.setInputs({ steer: 1 }, 'keyboard');
    sim.setInputs({ steer: -1 }, 'touch');
    sim.step(1/60);
    expect(sim.player.kinematic.rotation).toBe(0);
    sim.setInputs({ steer: 0 }, 'touch');
    sim.step(1/60);
    expect(sim.player.kinematic.rotation).toBeGreaterThan(0);
  });
  it('clears every input source and rejects commands entered while paused', () => {
    const sim = create();
    sim.setInputs({ throttle: 1 }, 'keyboard');
    sim.setInputs({ fireFront: true }, 'touch');
    sim.pause();
    sim.setInputs({ fireBroadsideLeft: true }, 'touch');
    sim.resume();sim.step(1/60);
    expect(sim.projectiles).toHaveLength(0);
    expect(sim.player.kinematic.velocityY).toBe(0);
  });
});
