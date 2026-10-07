import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SimulationBridge } from '../../../src/core/bridge/SimulationBridge';
import type { MatchEvent } from '../../../src/types';

describe('Pause Mechanics, Anti-Input Buffering & Decoupled State Bridge', () => {
  let bridge: SimulationBridge;

  beforeEach(() => {
    bridge = new SimulationBridge({ sessionDurationSeconds: 90 }, 101);
  });

  afterEach(() => {
    bridge.destroy();
  });

  describe('Pause & Anti-Input Buffering', () => {
    it('freezes timers, physics, and cooldowns during manual pause', () => {
      const sim = bridge.getSimulation();
      sim.weaponSystem.cooldownFront = 0.5;
      const initialRemaining = sim.remainingSeconds;
      const initialX = sim.player.kinematic.x;

      bridge.pauseMatch();
      expect(sim.isPaused).toBe(true);

      // Attempt inputs while paused (should be rejected)
      sim.setInputs({ throttle: 1, fireFront: true });

      // Step while paused
      bridge.step(1.0);

      // Verify complete freeze
      expect(sim.remainingSeconds).toBe(initialRemaining);
      expect(sim.player.kinematic.x).toBe(initialX);
      expect(sim.weaponSystem.cooldownFront).toBe(0.5);
      expect(sim.projectiles.length).toBe(0);
    });

    it('clears all held inputs on pause and on resume to eliminate buffered inputs', () => {
      const sim = bridge.getSimulation();

      // Hold forward throttle and firing
      sim.setInputs({ throttle: 1, steer: 1, fireFront: true });

      // Trigger pause
      bridge.pauseMatch();

      // Resume
      bridge.resumeMatch();
      expect(sim.isPaused).toBe(false);

      // Step one tick after resume: ship MUST NOT dash or shoot because buffer was cleared!
      const prevX = sim.player.kinematic.x;
      const prevY = sim.player.kinematic.y;
      bridge.step(1 / 60);

      // No movement or firing occurred
      expect(sim.player.kinematic.x).toBe(prevX);
      expect(sim.player.kinematic.y).toBe(prevY);
      expect(sim.projectiles.length).toBe(0);
    });

    it('auto-pauses on window blur and visibility change, but forbids auto-unpause on focus return', () => {
      const sim = bridge.getSimulation();
      expect(sim.isPaused).toBe(false);

      // Simulate window blur
      window.dispatchEvent(new Event('blur'));
      expect(sim.isPaused).toBe(true);

      // Simulate window focus: FORBIDDEN to auto-resume!
      window.dispatchEvent(new Event('focus'));
      expect(sim.isPaused).toBe(true); // Must remain paused until explicit resume!
    });
  });

  describe('Decoupled State Sync (Zero-Jank Bridge)', () => {
    it('throttles time_tick events to 1Hz (only on integer second transitions)', () => {
      const timeEvents: number[] = [];
      bridge.onMatchEvent((evt: MatchEvent) => {
        if (evt.type === 'time_tick') {
          timeEvents.push(evt.remainingSeconds);
        }
      });

      bridge.startMatch();
      timeEvents.length = 0; // Clear start event

      // Step 60 ticks (1 full second at 60 FPS)
      for (let i = 0; i < 60; i++) {
        bridge.step(1 / 60);
      }

      // Over 60 physics frames, time_tick must have fired EXACTLY ONCE (at 1Hz)!
      expect(timeEvents.length).toBe(1);
      expect(timeEvents[0]).toBe(89);
    });

    it('emits discrete score_changed event only on actual score modification', () => {
      const scoreEvents: number[] = [];
      bridge.onMatchEvent((evt: MatchEvent) => {
        if (evt.type === 'score_changed') {
          scoreEvents.push(evt.score);
        }
      });

      bridge.startMatch();
      scoreEvents.length = 0;

      // 30 ticks without score change
      for (let i = 0; i < 30; i++) {
        bridge.step(1 / 60);
      }
      expect(scoreEvents.length).toBe(0);

      // Artificially award 1 score
      bridge.getSimulation().score = 1;
      bridge.step(1 / 60);

      expect(scoreEvents.length).toBe(1);
      expect(scoreEvents[0]).toBe(1);
    });

    it('emits discrete health_changed event only on damage', () => {
      const healthEvents: number[] = [];
      bridge.onMatchEvent((evt: MatchEvent) => {
        if (evt.type === 'health_changed') {
          healthEvents.push(evt.current);
        }
      });

      bridge.startMatch();
      healthEvents.length = 0;

      // Unharmed ticks
      for (let i = 0; i < 10; i++) {
        bridge.step(1 / 60);
      }
      expect(healthEvents.length).toBe(0);

      // Player takes damage
      bridge.getSimulation().player.health = 75;
      bridge.step(1 / 60);

      expect(healthEvents.length).toBe(1);
      expect(healthEvents[0]).toBe(75);
    });
  });

  describe('window.__GAME_SIMULATION__ Test Harness Interface', () => {
    it('exposes deterministic inspection and control API on window', () => {
      const harness = (window as any).__GAME_SIMULATION__;
      expect(harness).toBeDefined();
      expect(harness.isTestMode).toBe(true);

      // 1. getState
      const state = harness.getState();
      expect(state.player).toBeDefined();
      expect(state.player.health).toBe(100);

      // 2. setPlayerPosition
      harness.setPlayerPosition(450, 650, Math.PI / 4);
      expect(harness.getState().player.x).toBe(450);
      expect(harness.getState().player.y).toBe(650);

      // 3. spawnEnemy
      harness.spawnEnemy('chaser', 300, 300);
      harness.spawnEnemy('shooter', 400, 400);
      expect(harness.getState().enemies.length).toBe(2);

      // 4. triggerPlayerFire
      harness.triggerPlayerFire('front');
      expect(harness.getState().projectiles.length).toBe(1);
      harness.triggerPlayerFire('left');
      expect(harness.getState().projectiles.length).toBe(4); // 1 + 3

      // 5. setPlayerHealth
      harness.setPlayerHealth(40);
      expect(harness.getState().player.health).toBe(40);

      // 6. setTimeRemaining
      harness.setTimeRemaining(15);
      expect(harness.getState().remainingSeconds).toBe(15);

      // 7. pause & resume
      harness.pause();
      expect(bridge.getSnapshot().isPaused).toBe(true);
      harness.resume();
      expect(bridge.getSnapshot().isPaused).toBe(false);
    });
  });
});
