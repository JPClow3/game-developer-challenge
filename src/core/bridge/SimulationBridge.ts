import type {
  GameplayConfig,
  MatchEvent,
  MatchSnapshot,
  SimulationDebugState,
  SimulationHarness,
} from '../../types';
import { GameSimulation } from '../simulation/GameSimulation';
import { exposeTestHarness } from '../debug';

export type MatchEventListener = (event: MatchEvent) => void;

/**
 * Extended SimulationHarness with additional test helper controls.
 */
export interface FullSimulationHarness extends SimulationHarness {
  isTestMode: boolean;
  triggerPlayerFire(weapon: 'front' | 'left' | 'right'): void;
  setPlayerPosition(x: number, y: number, rotation?: number): void;
  pause(): void;
  resume(): void;
}

/**
 * SimulationBridge: Decoupled synchronization bridge between the TypeScript simulation and React UI.
 * Throttles continuous 60 FPS state into discrete events and 1Hz timer ticks, preventing React re-render thrashing.
 * Exposes window.__GAME_SIMULATION__ harness for deterministic Playwright and Vitest testing.
 */
export class SimulationBridge {
  private simulation: GameSimulation;
  private listeners: Set<MatchEventListener> = new Set();
  private lastEmittedSecond = -1;
  private lastEmittedScore = -1;
  private lastEmittedHealth = -1;
  private unsubSimulation: (() => void) | null = null;

  constructor(customConfig?: Partial<GameplayConfig>, seed: number = 1337) {
    this.simulation = new GameSimulation(customConfig, seed);
    this.bindSimulationEvents();
    this.attachWindowHarness();
  }

  public getSimulation(): GameSimulation {
    return this.simulation;
  }

  /**
   * Starts or restarts a match with optional custom config.
   */
  public startMatch(config?: Partial<GameplayConfig>): void {
    this.simulation.restart(config);
    this.lastEmittedSecond = Math.ceil(Math.round(this.simulation.remainingSeconds * 1000) / 1000);
    this.lastEmittedScore = this.simulation.score;
    this.lastEmittedHealth = this.simulation.player.health;

    this.emit({
      type: 'time_tick',
      remainingSeconds: this.lastEmittedSecond,
    });
    this.emit({
      type: 'health_changed',
      current: this.simulation.player.health,
      max: this.simulation.player.maxHealth,
      percentage: 100,
    });
    this.emit({
      type: 'score_changed',
      score: 0,
    });
  }

  public pauseMatch(): void {
    this.simulation.pause();
  }

  public resumeMatch(): void {
    this.simulation.resume();
  }

  public abandonMatch(): void {
    this.simulation.abandonMatch();
  }

  /**
   * Advances simulation frame. Call from PixiJS ticker or requestAnimationFrame.
   */
  public update(frameDeltaSeconds: number): void {
    if (this.simulation.isPaused || this.simulation.isEnded) {
      return;
    }

    this.simulation.update(frameDeltaSeconds);
    this.pollDecoupledState();
  }

  /**
   * Advances a single fixed-timestep step (1/60s).
   */
  public step(dt: number = 1 / 60): void {
    this.simulation.step(dt);
    this.pollDecoupledState();
  }

  /**
   * Subscribes to decoupled match events (1Hz timer, score, health transitions, match end).
   */
  public onMatchEvent(listener: MatchEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: MatchEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Retrieves instantaneous snapshot without triggering React re-renders.
   */
  public getSnapshot(): Readonly<MatchSnapshot> {
    return this.simulation.getSnapshot();
  }

  /**
   * Binds to low-level GameSimulation discrete events.
   */
  private bindSimulationEvents(): void {
    this.unsubSimulation = this.simulation.addListener((event) => {
      if (event.type === 'match_ended') {
        this.emit({
          type: 'match_ended',
          reason: event.payload.reason,
          finalScore: event.payload.finalScore,
          durationSeconds: event.payload.durationSeconds,
          config: event.payload.config,
        });
      } else if (event.type === 'projectile_spawned') {
        this.emit({
          type: 'projectile_spawned',
          projectile: event.payload,
        });
      }
    });
  }

  /**
   * Polls continuous simulation metrics and triggers discrete events only on change:
   * - 1Hz Throttled timer: Math.ceil(remainingSeconds) integer change.
   * - Discrete score transition.
   * - Discrete health transition.
   */
  private pollDecoupledState(): void {
    // 1. Throttled 1Hz timer updates
    const roundedRemaining = Math.round(this.simulation.remainingSeconds * 1000) / 1000;
    const currentSec = Math.ceil(roundedRemaining);
    if (currentSec !== this.lastEmittedSecond && currentSec >= 0) {
      this.lastEmittedSecond = currentSec;
      this.emit({
        type: 'time_tick',
        remainingSeconds: currentSec,
      });
    }

    // 2. Discrete Score Transitions
    if (this.simulation.score !== this.lastEmittedScore) {
      this.lastEmittedScore = this.simulation.score;
      this.emit({
        type: 'score_changed',
        score: this.simulation.score,
      });
    }

    // 3. Discrete Player Health Transitions
    if (this.simulation.player.health !== this.lastEmittedHealth) {
      this.lastEmittedHealth = this.simulation.player.health;
      this.emit({
        type: 'health_changed',
        current: this.simulation.player.health,
        max: this.simulation.player.maxHealth,
        percentage: (this.simulation.player.health / this.simulation.player.maxHealth) * 100,
      });
    }
  }

  /**
   * Attaches test harness to window.__GAME_SIMULATION__.
   */
  private attachWindowHarness(): void {
    if (!exposeTestHarness || typeof window === 'undefined') return;

    const harness: FullSimulationHarness = {
      isTestMode: true,
      setSeed: (seed: number) => {
        this.simulation.spawner.setSeed(seed);
      },
      step: (dt: number) => {
        this.step(dt);
      },
      getState: (): SimulationDebugState => {
        return this.simulation.getDebugState();
      },
      spawnEnemy: (type: 'chaser' | 'shooter', x?: number, y?: number) => {
        const spawned = this.simulation.spawner.forceSpawn(
          type,
          x,
          y,
          this.simulation.player.kinematic,
          this.simulation.obstacles,
          this.simulation.config.arena
        );
        this.simulation.enemies.push(spawned);
      },
      setPlayerHealth: (hp: number) => {
        this.simulation.player.health = Math.max(0, Math.min(this.simulation.player.maxHealth, hp));
        if (this.simulation.player.health <= 0) {
          this.simulation.player.isDestroyed = true;
          this.simulation.endMatch('player_destroyed');
        }
        this.pollDecoupledState();
      },
      setTimeRemaining: (seconds: number) => {
        this.simulation.remainingSeconds = Math.max(0, seconds);
        if (this.simulation.remainingSeconds <= 0) {
          this.simulation.endMatch('time_expired');
        }
        this.pollDecoupledState();
      },
      triggerPlayerFire: (weapon: 'front' | 'left' | 'right') => {
        const sim = this.simulation;
        if (weapon === 'front') {
          const projs = sim.weaponSystem.fireFront(sim.player.kinematic, 'player');
          sim.projectiles.push(...projs);
        } else if (weapon === 'left') {
          const projs = sim.weaponSystem.fireBroadsideLeft(sim.player.kinematic, 'player');
          sim.projectiles.push(...projs);
        } else if (weapon === 'right') {
          const projs = sim.weaponSystem.fireBroadsideRight(sim.player.kinematic, 'player');
          sim.projectiles.push(...projs);
        }
      },
      setPlayerPosition: (x: number, y: number, rotation?: number) => {
        this.simulation.player.kinematic.x = x;
        this.simulation.player.kinematic.y = y;
        this.simulation.player.kinematic.prevX = x;
        this.simulation.player.kinematic.prevY = y;
        if (rotation !== undefined) {
          this.simulation.player.kinematic.rotation = rotation;
          this.simulation.player.kinematic.prevRotation = rotation;
        }
      },
      pause: () => {
        this.pauseMatch();
      },
      resume: () => {
        this.resumeMatch();
      },
    };

    (window as any).__GAME_SIMULATION__ = harness;
  }

  /**
   * Cleans up bridge resources, simulation listeners, and global test harness.
   */
  public destroy(): void {
    if (this.unsubSimulation) {
      this.unsubSimulation();
      this.unsubSimulation = null;
    }
    this.simulation.destroy();
    this.listeners.clear();

    if (typeof window !== 'undefined' && (window as any).__GAME_SIMULATION__) {
      delete (window as any).__GAME_SIMULATION__;
    }
  }
}
