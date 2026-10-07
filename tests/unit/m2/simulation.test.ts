import { describe, it, expect, beforeEach } from 'vitest';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import { ChaserAI } from '../../../src/core/ai/ChaserAI';
import { ShooterAI } from '../../../src/core/ai/ShooterAI';

describe('GameSimulation Engine', () => {
  let sim: GameSimulation;

  beforeEach(() => {
    sim = new GameSimulation({ sessionDurationSeconds: 90 }, 42);
  });

  it('initializes with full health, configured timer, and 0 score', () => {
    expect(sim.player.health).toBe(100);
    expect(sim.score).toBe(0);
    expect(sim.remainingSeconds).toBe(90);
    expect(sim.durationSeconds).toBe(90);
    expect(sim.isPaused).toBe(false);
    expect(sim.isEnded).toBe(false);
    expect(sim.endReason).toBeNull();
  });

  it('runs fixed timestep loop with accumulator and sub-step clamp of 5', () => {
    // Large delta (e.g. 0.5s) clamped to maxAccumulator 0.25s
    // 0.25s / (1/60) = 15 steps, but sub-step clamp is 5!
    const initialTicks = sim.tickCount;
    sim.update(0.5);

    expect(sim.tickCount - initialTicks).toBe(5); // Strictly clamped to 5 substeps!
    expect(sim.alpha).toBeGreaterThanOrEqual(0);
  });

  it('ends match with reason time_expired when session timer runs out', () => {
    let matchEndEvent: any = null;
    sim.addListener((evt) => {
      if (evt.type === 'match_ended') {
        matchEndEvent = evt.payload;
      }
    });

    // Advance session beyond 90s
    sim.remainingSeconds = 0.05;
    sim.step(0.1);

    expect(sim.isEnded).toBe(true);
    expect(sim.endReason).toBe('time_expired');
    expect(sim.remainingSeconds).toBe(0);
    expect(matchEndEvent).not.toBeNull();
    expect(matchEndEvent.reason).toBe('time_expired');
  });

  it('ends match with reason player_destroyed when player health reaches zero', () => {
    let matchEndEvent: any = null;
    sim.addListener((evt) => {
      if (evt.type === 'match_ended') {
        matchEndEvent = evt.payload;
      }
    });

    // Spawn 3 chasers touching player to ram and deplete 100 HP (35 * 3 = 105 dmg)
    sim.enemies.push(ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0));
    sim.enemies.push(ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0));
    sim.enemies.push(ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0));

    sim.step(1 / 60);

    expect(sim.player.health).toBe(0);
    expect(sim.player.isDestroyed).toBe(true);
    expect(sim.isEnded).toBe(true);
    expect(sim.endReason).toBe('player_destroyed');
    expect(matchEndEvent.reason).toBe('player_destroyed');
    // Chaser ramming awards STRICTLY 0 score
    expect(sim.score).toBe(0);
  });

  it('awards +1 score per enemy destroyed by player attacks', () => {
    // Spawn a shooter enemy near player bow
    const shooter = ShooterAI.create(
      sim.player.kinematic.x,
      sim.player.kinematic.y - 100, // North
      Math.PI // Facing South
    );
    shooter.health = 20; // 1 frontal hit will destroy it
    sim.enemies.push(shooter);

    // Set player to fire frontal cannon
    sim.setInputs({ fireFront: true });
    sim.step(1 / 60);

    // Projectile spawned
    expect(sim.projectiles.length).toBeGreaterThan(0);

    // Advance projectiles until collision
    for (let i = 0; i < 20; i++) {
      sim.step(1 / 60);
      if (sim.score > 0) break;
    }

    expect(sim.score).toBe(1);
  });

  it('discards match when abandoned mid-game (endReason: abandoned)', () => {
    let abandoned = false;
    sim.addListener((evt) => {
      if (evt.type === 'match_abandoned') {
        abandoned = true;
      }
    });

    sim.abandonMatch();

    expect(sim.isEnded).toBe(true);
    expect(sim.endReason).toBe('abandoned');
    expect(abandoned).toBe(true);
  });

  it('restores all state cleanly on restart', () => {
    sim.score = 5;
    sim.player.health = 20;
    sim.enemies.push(ChaserAI.create(200, 200, 0));
    sim.endMatch('player_destroyed');

    sim.restart();

    expect(sim.score).toBe(0);
    expect(sim.player.health).toBe(100);
    expect(sim.enemies.length).toBe(0);
    expect(sim.isEnded).toBe(false);
    expect(sim.endReason).toBeNull();
  });

  it('provides comprehensive snapshot and debug state', () => {
    const snap = sim.getSnapshot();
    expect(snap.playerHealth).toBe(100);
    expect(snap.playerMaxHealth).toBe(100);
    expect(snap.remainingSeconds).toBe(90);

    const debug = sim.getDebugState();
    expect(debug.player.health).toBe(100);
    expect(debug.tickCount).toBe(0);
  });
});
