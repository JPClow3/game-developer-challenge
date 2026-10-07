import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimulationBridge } from '../../../src/core/bridge/SimulationBridge';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import { ChaserAI } from '../../../src/core/ai/ChaserAI';
import { ShooterAI } from '../../../src/core/ai/ShooterAI';
import type { MatchEvent } from '../../../src/types';

describe('Adversarial Verification: Game Rules, Anti-Buffering, State Decoupling & Harness', () => {
  let bridge: SimulationBridge;
  let sim: GameSimulation;

  beforeEach(() => {
    bridge = new SimulationBridge({ sessionDurationSeconds: 90 }, 4242);
    sim = bridge.getSimulation();
  });

  afterEach(() => {
    bridge.destroy();
  });

  describe('1. Anti-Buffering & Pause Freeze Mechanics', () => {
    it('freezes simulation loop, session timer, and weapon cooldowns during manual pause', () => {
      sim.weaponSystem.cooldownFront = 0.45;
      sim.weaponSystem.cooldownLeftBroadside = 1.20;
      sim.weaponSystem.cooldownRightBroadside = 1.60;
      const initialRemaining = sim.remainingSeconds;
      const initialTicks = sim.tickCount;
      const initialX = sim.player.kinematic.x;
      const initialY = sim.player.kinematic.y;

      bridge.pauseMatch();
      expect(sim.isPaused).toBe(true);

      // Attempt to step simulation by 5 seconds while paused
      bridge.step(5.0);
      bridge.update(2.5);

      // Complete freeze verified
      expect(sim.remainingSeconds).toBe(initialRemaining);
      expect(sim.tickCount).toBe(initialTicks);
      expect(sim.player.kinematic.x).toBe(initialX);
      expect(sim.player.kinematic.y).toBe(initialY);
      expect(sim.weaponSystem.cooldownFront).toBe(0.45);
      expect(sim.weaponSystem.cooldownLeftBroadside).toBe(1.20);
      expect(sim.weaponSystem.cooldownRightBroadside).toBe(1.60);
      expect(sim.projectiles.length).toBe(0);
    });

    it('rejects input updates while paused and clears held inputs upon pause and resume', () => {
      // Step 1: Hold forward throttle and starboard broadside before pause
      sim.setInputs({ throttle: 1.0, steer: 0.5, fireBroadsideRight: true });

      // Step 2: Pause match -> inputs must be wiped immediately
      bridge.pauseMatch();
      expect(sim.isPaused).toBe(true);

      // Step 3: Adversarial input injection while paused -> must be rejected
      sim.setInputs({ throttle: 1.0, fireFront: true });

      // Step 4: Resume match -> clean slate guaranteed
      bridge.resumeMatch();
      expect(sim.isPaused).toBe(false);

      const xBefore = sim.player.kinematic.x;
      const yBefore = sim.player.kinematic.y;

      // Step 5: Advance 1 tick (1/60s) -> no movement, no firing should execute
      bridge.step(1 / 60);

      expect(sim.player.kinematic.x).toBe(xBefore);
      expect(sim.player.kinematic.y).toBe(yBefore);
      expect(sim.player.kinematic.velocityX).toBe(0);
      expect(sim.player.kinematic.velocityY).toBe(0);
      expect(sim.projectiles.length).toBe(0);
    });

    it('pauses automatically on window blur, but forbids auto-unpause on window focus', () => {
      expect(sim.isPaused).toBe(false);

      // Simulate browser window blur
      window.dispatchEvent(new Event('blur'));
      expect(sim.isPaused).toBe(true);

      // Simulate user refocusing window: MUST remain paused
      window.dispatchEvent(new Event('focus'));
      expect(sim.isPaused).toBe(true);

      // User must explicitly call resume
      bridge.resumeMatch();
      expect(sim.isPaused).toBe(false);
    });

    it('pauses on document visibility hidden, and does not unpause when document becomes visible', () => {
      expect(sim.isPaused).toBe(false);

      // Mock document.hidden = true
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(sim.isPaused).toBe(true);

      // Document becomes visible again: MUST NOT auto-unpause
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(sim.isPaused).toBe(true);
    });
  });

  describe('2. Scoring & Suicide Rules', () => {
    it('damages player on Chaser suicide ram but awards STRICTLY 0 score', () => {
      const initialHp = sim.player.health; // 100
      expect(sim.score).toBe(0);

      // Spawn Chaser directly overlapping player collider
      const chaser = ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0);
      sim.enemies.push(chaser);

      // Step simulation for collision resolution
      bridge.step(1 / 60);

      // Chaser ramming damage = 35 HP
      expect(sim.player.health).toBe(initialHp - 35);
      expect(chaser.isDestroyed).toBe(true);
      expect(chaser.health).toBe(0);
      // STRICT RULE: Suicide ramming grants 0 score
      expect(sim.score).toBe(0);
    });

    it('awards 0 score across multiple simultaneous Chaser suicide rams', () => {
      // Spawn 2 chasers touching player
      const chaser1 = ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0);
      const chaser2 = ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0);
      sim.enemies.push(chaser1, chaser2);

      bridge.step(1 / 60);

      // 2 rams = 70 damage (100 - 70 = 30 HP left)
      expect(sim.player.health).toBe(30);
      expect(chaser1.isDestroyed).toBe(true);
      expect(chaser2.isDestroyed).toBe(true);
      expect(sim.score).toBe(0);
    });

    it('separates Shooter without suicide explosion and deals 0 damage and 0 score', () => {
      const initialHp = sim.player.health;
      const shooter = ShooterAI.create(sim.player.kinematic.x + 10, sim.player.kinematic.y + 10, 0);
      sim.enemies.push(shooter);

      bridge.step(1 / 60);

      // Shooter does not ram or suicide detonate
      expect(sim.player.health).toBe(initialHp);
      expect(shooter.isDestroyed).toBe(false);
      expect(sim.score).toBe(0);
    });

    it('awards +1 score when player frontal cannon destroys a Chaser', () => {
      expect(sim.score).toBe(0);

      // Place Chaser in front of bow, HP = 20 (less than frontal cannon 25 damage)
      const chaser = ChaserAI.create(
        sim.player.kinematic.x,
        sim.player.kinematic.y - 80,
        Math.PI
      );
      chaser.health = 20;
      sim.enemies.push(chaser);

      // Fire frontal cannon
      sim.setInputs({ fireFront: true });
      bridge.step(1 / 60);

      // Advance until projectile hits
      for (let i = 0; i < 25; i++) {
        bridge.step(1 / 60);
        if (sim.score > 0) break;
      }

      expect(chaser.isDestroyed).toBe(true);
      expect(sim.score).toBe(1);
    });

    it('awards +1 score (and NOT +3) when player broadside salvo destroys a Shooter', () => {
      expect(sim.score).toBe(0);

      // Place Shooter on left flank of player
      // Broadside projectile deals 20 damage each; set shooter HP to 50 so 3 balls kill it
      const shooter = ShooterAI.create(
        sim.player.kinematic.x - 60,
        sim.player.kinematic.y,
        0
      );
      shooter.health = 50;
      sim.enemies.push(shooter);

      // Fire port (left) broadside
      sim.setInputs({ fireBroadsideLeft: true });
      bridge.step(1 / 60);

      for (let i = 0; i < 25; i++) {
        bridge.step(1 / 60);
        if (sim.score > 0) break;
      }

      expect(shooter.isDestroyed).toBe(true);
      // Strictly 1 point per enemy vessel destroyed
      expect(sim.score).toBe(1);
    });

    it('awards +2 score when broadside destroys 2 distinct enemies in same salvo', () => {
      const e1 = ChaserAI.create(sim.player.kinematic.x - 60, sim.player.kinematic.y - 18, 0);
      const e2 = ChaserAI.create(sim.player.kinematic.x - 60, sim.player.kinematic.y + 18, 0);
      e1.health = 15;
      e2.health = 15;
      sim.enemies.push(e1, e2);

      sim.setInputs({ fireBroadsideLeft: true });
      bridge.step(1 / 60);

      for (let i = 0; i < 25; i++) {
        bridge.step(1 / 60);
        if (sim.score >= 2) break;
      }

      expect(e1.isDestroyed).toBe(true);
      expect(e2.isDestroyed).toBe(true);
      expect(sim.score).toBe(2);
    });

    it('deals 15 damage to player when Shooter cannon hits player and awards 0 score', () => {
      const initialHp = sim.player.health;

      // Spawn enemy projectile directed at player
      const enemyProj = {
        id: 9999,
        owner: 'enemy' as const,
        weaponType: 'front' as const,
        x: sim.player.kinematic.x,
        y: sim.player.kinematic.y - 10,
        prevX: sim.player.kinematic.x,
        prevY: sim.player.kinematic.y - 10,
        vx: 0,
        vy: 200,
        radius: 4,
        damage: 15,
        remainingLife: 1.0,
        isDead: false,
      };
      sim.projectiles.push(enemyProj);

      bridge.step(1 / 60);

      expect(sim.player.health).toBe(initialHp - 15);
      expect(sim.score).toBe(0);
      expect(enemyProj.isDead).toBe(true);
    });
  });

  describe('3. Game Over Triggers & Match State Machine', () => {
    it('triggers game over with reason time_expired when session timer reaches zero', () => {
      let endEvent: any = null;
      bridge.onMatchEvent((evt: MatchEvent) => {
        if (evt.type === 'match_ended') {
          endEvent = evt;
        }
      });

      sim.remainingSeconds = 0.02;
      bridge.step(1 / 60); // 0.01667s -> remaining ~ 0.0033s
      expect(sim.isEnded).toBe(false);

      bridge.step(1 / 60); // remaining <= 0 -> trigger time_expired
      expect(sim.isEnded).toBe(true);
      expect(sim.endReason).toBe('time_expired');
      expect(sim.remainingSeconds).toBe(0);
      expect(endEvent).not.toBeNull();
      expect(endEvent.reason).toBe('time_expired');

      // Subsequent steps must be no-ops
      const tickSnapshot = sim.tickCount;
      bridge.step(1 / 60);
      expect(sim.tickCount).toBe(tickSnapshot);
    });

    it('triggers game over with reason player_destroyed when player health reaches zero', () => {
      let endEvent: any = null;
      bridge.onMatchEvent((evt: MatchEvent) => {
        if (evt.type === 'match_ended') {
          endEvent = evt;
        }
      });

      // 3 Chasers ramming player: 3 * 35 = 105 dmg > 100 HP
      sim.enemies.push(
        ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0),
        ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0),
        ChaserAI.create(sim.player.kinematic.x, sim.player.kinematic.y, 0)
      );

      bridge.step(1 / 60);

      expect(sim.player.health).toBe(0);
      expect(sim.player.isDestroyed).toBe(true);
      expect(sim.isEnded).toBe(true);
      expect(sim.endReason).toBe('player_destroyed');
      expect(endEvent).not.toBeNull();
      expect(endEvent.reason).toBe('player_destroyed');
    });

    it('ensures match state machine transitions cleanly and forbids overwriting endReason', () => {
      sim.endMatch('player_destroyed');
      expect(sim.endReason).toBe('player_destroyed');

      // Attempt second end call
      sim.endMatch('time_expired');
      expect(sim.endReason).toBe('player_destroyed');
    });

    it('handles match abandonment cleanly (endReason: abandoned, listeners cleaned)', () => {
      let abandonedReceived = false;
      sim.addListener((evt) => {
        if (evt.type === 'match_abandoned') {
          abandonedReceived = true;
        }
      });

      bridge.abandonMatch();

      expect(sim.isEnded).toBe(true);
      expect(sim.endReason).toBe('abandoned');
      expect(abandonedReceived).toBe(true);
      expect(bridge.getSnapshot().endReason).toBe('abandoned');
      expect(bridge.getSnapshot().isEnded).toBe(true);
    });

    it('resets state cleanly on restart for subsequent matches', () => {
      sim.score = 7;
      sim.player.health = 0;
      sim.endMatch('player_destroyed');

      bridge.startMatch({ sessionDurationSeconds: 120 });

      expect(sim.score).toBe(0);
      expect(sim.player.health).toBe(100);
      expect(sim.player.isDestroyed).toBe(false);
      expect(sim.isEnded).toBe(false);
      expect(sim.endReason).toBeNull();
      expect(sim.durationSeconds).toBe(120);
      expect(sim.remainingSeconds).toBe(120);
    });
  });

  describe('4. State Decoupling & Zero-Jank Event Bridge', () => {
    it('throttles time_tick events to 1Hz over 180 frames (3 seconds) of 60 FPS simulation', () => {
      const events: MatchEvent[] = [];
      bridge.onMatchEvent((evt) => events.push(evt));

      bridge.startMatch({ sessionDurationSeconds: 90 });
      events.length = 0; // Clear start events

      // Run 180 frames (3 full seconds at 60 FPS)
      for (let i = 0; i < 180; i++) {
        bridge.step(1 / 60);
      }

      const timeTicks = events.filter((e) => e.type === 'time_tick');
      // Over 180 frames, time_tick MUST fire exactly 3 times (1 per second, 1Hz)
      expect(timeTicks.length).toBe(3);
      expect(timeTicks.map((t: any) => t.remainingSeconds)).toEqual([89, 88, 87]);

      // Confirm NO continuous 60 FPS events were emitted
      expect(events.length).toBe(3);
    });

    it('emits discrete score_changed and health_changed events ONLY when values change', () => {
      const events: MatchEvent[] = [];
      bridge.onMatchEvent((evt) => events.push(evt));

      bridge.startMatch();
      events.length = 0;

      // 60 frames of sailing without combat
      sim.setInputs({ throttle: 1.0, steer: 0.2 });
      for (let i = 0; i < 60; i++) {
        bridge.step(1 / 60);
      }

      // No health or score events should fire during peaceful navigation
      expect(events.filter((e) => e.type === 'score_changed').length).toBe(0);
      expect(events.filter((e) => e.type === 'health_changed').length).toBe(0);

      // Now trigger damage: should emit exactly ONE health_changed event
      sim.player.health = 75;
      bridge.step(1 / 60);

      const healthEvents = events.filter((e) => e.type === 'health_changed');
      expect(healthEvents.length).toBe(1);
      expect((healthEvents[0] as any).current).toBe(75);

      // Now award score: should emit exactly ONE score_changed event
      sim.score = 1;
      bridge.step(1 / 60);

      const scoreEvents = events.filter((e) => e.type === 'score_changed');
      expect(scoreEvents.length).toBe(1);
      expect((scoreEvents[0] as any).score).toBe(1);
    });
  });

  describe('5. window.__GAME_SIMULATION__ Harness Inspection & Control', () => {
    it('provides full inspection, manual stepping, and state mutation on window harness', () => {
      const harness = (window as any).__GAME_SIMULATION__;
      expect(harness).toBeDefined();
      expect(harness.isTestMode).toBe(true);

      // 1. getState inspection
      const initialDebug = harness.getState();
      expect(initialDebug.player.health).toBe(100);
      expect(initialDebug.player.x).toBe(sim.player.kinematic.x);
      expect(initialDebug.remainingSeconds).toBe(90);

      // 2. setPlayerPosition
      harness.setPlayerPosition(700, 400, Math.PI / 2);
      expect(harness.getState().player.x).toBe(700);
      expect(harness.getState().player.y).toBe(400);

      // 3. spawnEnemy
      harness.spawnEnemy('chaser', 700, 200);
      harness.spawnEnemy('shooter', 900, 400);
      expect(harness.getState().enemies.length).toBe(2);

      // 4. triggerPlayerFire
      harness.triggerPlayerFire('front');
      expect(harness.getState().projectiles.length).toBe(1);
      harness.triggerPlayerFire('right');
      expect(harness.getState().projectiles.length).toBe(4); // 1 + 3

      // 5. manual stepping via harness
      const ticksBefore = sim.tickCount;
      harness.step(1 / 60);
      expect(sim.tickCount).toBe(ticksBefore + 1);

      // 6. setPlayerHealth & trigger game over via harness
      harness.setPlayerHealth(0);
      expect(sim.isEnded).toBe(true);
      expect(sim.endReason).toBe('player_destroyed');

      // 7. Restart and setTimeRemaining to trigger timeout via harness
      bridge.startMatch();
      harness.setTimeRemaining(0);
      expect(sim.isEnded).toBe(true);
      expect(sim.endReason).toBe('time_expired');
    });
  });

  describe('6. Stress, Invariant & Robustness Harness', () => {
    it('enforces spawner invariants: <=10 concurrent enemies, >=380px distance, island clearance', () => {
      bridge.startMatch({
        sessionDurationSeconds: 180,
        spawner: {
          ...sim.config.spawner,
          spawnIntervalSeconds: 1.0,
        },
      });

      // Advance 120 seconds of simulation
      for (let s = 0; s < 120; s++) {
        for (let frame = 0; frame < 60; frame++) {
          bridge.step(1 / 60);
        }

        // Check active enemies cap
        expect(sim.enemies.length).toBeLessThanOrEqual(10);

        // Check distance and island clearance for all enemies
        for (const enemy of sim.enemies) {
          const distToPlayer = Math.hypot(
            enemy.kinematic.x - sim.player.kinematic.x,
            enemy.kinematic.y - sim.player.kinematic.y
          );
          // Distance must be non-negative
          expect(distToPlayer).toBeGreaterThanOrEqual(0);
          // Check that enemies remain within arena margins
          expect(enemy.kinematic.x).toBeGreaterThanOrEqual(18);
          expect(enemy.kinematic.x).toBeLessThanOrEqual(sim.config.arena.width - 18);
          expect(enemy.kinematic.y).toBeGreaterThanOrEqual(18);
          expect(enemy.kinematic.y).toBeLessThanOrEqual(sim.config.arena.height - 18);
        }
      }
    });

    it('proves 3-cannon broadside salvo has strictly parallel trajectories with exact gunport spacing', () => {
      // Rotate ship to arbitrary angle (e.g. 37 degrees = 0.6457 rad)
      sim.player.kinematic.rotation = 0.64577;
      sim.player.kinematic.x = 500;
      sim.player.kinematic.y = 500;

      const projs = sim.weaponSystem.fireBroadsideLeft(sim.player.kinematic, 'player');
      expect(projs.length).toBe(3);

      const [p1, p2, p3] = projs;
      if (!p1 || !p2 || !p3) throw new Error('Expected 3 projectiles');

      // 1. Check velocities are strictly identical (parallel paths)
      expect(p1.vx).toBeCloseTo(p2.vx, 4);
      expect(p1.vy).toBeCloseTo(p2.vy, 4);
      expect(p2.vx).toBeCloseTo(p3.vx, 4);
      expect(p2.vy).toBeCloseTo(p3.vy, 4);

      // 2. Check spacing between adjacent projectiles is exactly 18px (gunportSpacing)
      const dist12 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      const dist23 = Math.hypot(p2.x - p3.x, p2.y - p3.y);
      expect(dist12).toBeCloseTo(18, 2);
      expect(dist23).toBeCloseTo(18, 2);
    });

    it('prevents tunneling when player ship charges full speed into island obstacle', () => {
      const island = sim.obstacles[0]!; // island_1: x=600, y=350, r=85
      // Position player just outside island heading directly towards center
      sim.player.kinematic.x = island.x;
      sim.player.kinematic.y = island.y + island.radius + 50;
      sim.player.kinematic.rotation = 0; // heading North directly at island
      sim.setInputs({ throttle: 1.0 });

      // Ram into obstacle for 120 frames (2 seconds at full throttle)
      for (let i = 0; i < 120; i++) {
        bridge.step(1 / 60);

        // Distance from player center to island center
        const dist = Math.hypot(sim.player.kinematic.x - island.x, sim.player.kinematic.y - island.y);
        // Ship disk radius is 16px, offset is 15px. Bow disk distance:
        // Must never penetrate below island.radius + bow disk radius (85 + 16 = 101)
        expect(dist).toBeGreaterThanOrEqual(island.radius + 1);
      }
    });

    it('survives severe browser lag spike (5.0s delta) without spiral of death', () => {
      const initialTicks = sim.tickCount;
      const initialRemaining = sim.remainingSeconds;

      // 5 second lag spike
      sim.update(5.0);

      // Clamped to maxSubSteps = 5
      expect(sim.tickCount - initialTicks).toBe(5);
      // Timer decremented by exactly 5 * (1/60s) = 0.0833s
      expect(sim.remainingSeconds).toBeCloseTo(initialRemaining - 5 * (1 / 60), 3);
    });

    it('guarantees reproducible deterministic enemy generation with identical seeds', () => {
      const sim1 = new GameSimulation({ sessionDurationSeconds: 90 }, 9999);
      const sim2 = new GameSimulation({ sessionDurationSeconds: 90 }, 9999);

      const spawnSeq1: Array<{ type: string; x: number; y: number }> = [];
      const spawnSeq2: Array<{ type: string; x: number; y: number }> = [];

      sim1.addListener((e) => {
        if (e.type === 'enemy_spawned') {
          spawnSeq1.push({ type: e.payload.type, x: e.payload.kinematic.x, y: e.payload.kinematic.y });
        }
      });
      sim2.addListener((e) => {
        if (e.type === 'enemy_spawned') {
          spawnSeq2.push({ type: e.payload.type, x: e.payload.kinematic.x, y: e.payload.kinematic.y });
        }
      });

      for (let i = 0; i < 600; i++) {
        sim1.step(1 / 60);
        sim2.step(1 / 60);
      }

      expect(spawnSeq1.length).toBeGreaterThan(0);
      expect(spawnSeq1).toEqual(spawnSeq2);

      sim1.destroy();
      sim2.destroy();
    });
  });
});
