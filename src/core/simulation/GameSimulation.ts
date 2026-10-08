import { createKinematicState } from '../kinematics/ShipKinematics';
import { stepCombat } from './CombatStep';
import { ReplaySession } from './ReplaySession';
import { TrainingEncounter } from './TrainingEncounter';
import { exposeTestHarness } from '../debug';
import type {
  GameplayConfig,
  PlayerShipState,
  EnemyShipState,
  Projectile,
  IslandObstacle,
  MatchEndReason,
  MatchSnapshot,
  SimulationDebugState,
} from '../../types';
import { validateGameplayConfig } from '../../types';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { EnemySpawner } from '../spawner/EnemySpawner';
import { validateReplay, type BattleReplay } from './Replay';
import { DEFAULT_ISLAND_OBSTACLES } from '../collision/CollisionSystem';
import { NavigationField } from '../ai/NavigationField';
import { RepairSalvage } from './RepairSalvage';
import { emptyBattleStats, battleReport } from './BattleReport';
import { isVoyageRules, voyageGameplayConfig, voyageObstacles } from './VoyageRules';

export interface PlayerInputState {
  throttle: number; // 0 to 1
  steer: number; // -1 to 1
  fireFront: boolean;
  fireBroadsideLeft: boolean;
  fireBroadsideRight: boolean;
}

export const DEFAULT_PLAYER_INPUT: PlayerInputState = {
  throttle: 0,
  steer: 0,
  fireFront: false,
  fireBroadsideLeft: false,
  fireBroadsideRight: false,
};

export type SimulationListener = (event: { type: string; payload?: any }) => void;

/**
 * GameSimulation: Pure TypeScript combat simulation engine.
 * Fixed timestep loop (dt = 1/60s), accumulator, sub-step clamp 5, alpha interpolation factor.
 * Session duration timer, deterministic collision, decoupled state sync, anti-input buffering.
 */
export class GameSimulation {
  public readonly seed: number;
  public readonly mode: 'match' | 'training' | 'replay';
  private readonly training = new TrainingEncounter();
  private readonly replay: ReplaySession;
  public get trainingStage() {
    return this.training.stage;
  }
  public get replayStatus() {
    return this.replay.status;
  }
  public get replayError() {
    return this.replay.error;
  }
  public get replaySpeed(): number {
    return this.replay.speed;
  }
  public get replayEndTick(): number {
    return this.replay.playback?.endTick ?? 0;
  }

  /** Presentation pacing only. Playback executes every original fixed tick. */
  public setReplaySpeed(speed: number): void {
    if (this.mode === 'replay' && [0.5, 1, 2, 4].includes(speed)) this.replay.speed = speed;
  }
  public entityCounters = { enemy: 0, projectile: 0 };
  public config: GameplayConfig;
  public readonly fixedTimestep = 1 / 60;
  public readonly maxAccumulator = 0.25;
  public readonly maxSubSteps = 5;

  public accumulator = 0;
  public alpha = 0;
  public isPaused = false;
  public isEnded = false;
  public endReason: MatchEndReason | null = null;

  public score = 0;
  public durationSeconds: number;
  public remainingSeconds: number;
  public elapsedSeconds = 0;
  public tickCount = 0;

  public player: PlayerShipState;
  public enemies: EnemyShipState[] = [];
  public projectiles: Projectile[] = [];
  public obstacles: IslandObstacle[];
  public stats = emptyBattleStats();
  public salvage: RepairSalvage;
  public navigation: NavigationField;

  public weaponSystem: WeaponSystem;
  public spawner: EnemySpawner;

  private currentInput: PlayerInputState = { ...DEFAULT_PLAYER_INPUT };
  private inputSources = new Map<string, PlayerInputState>();
  private latchedFireFront = false;
  private latchedFireBroadsideLeft = false;
  private latchedFireBroadsideRight = false;
  private listeners: Set<SimulationListener> = new Set();
  private cleanupWindowListeners: (() => void) | null = null;

  constructor(
    customConfig?: Partial<GameplayConfig>,
    seed: number = 1337,
    options: { mode?: 'training'; replay?: BattleReplay } = {},
  ) {
    if (options.replay) validateReplay(options.replay);
    this.mode = options.replay ? 'replay' : (options.mode ?? 'match');
    this.seed = options.replay?.seed ?? seed;
    customConfig = options.replay?.config ?? customConfig;
    const validated = validateGameplayConfig(customConfig);
    this.config = validated.validatedConfig;
    if (customConfig?.voyage) {
      if (!isVoyageRules(customConfig.voyage)) throw new Error('Invalid voyage selection.');
      this.config = voyageGameplayConfig(this.config.sessionDurationSeconds, this.config.spawner.spawnIntervalSeconds, customConfig.voyage);
    }
    this.durationSeconds = this.config.sessionDurationSeconds;
    this.remainingSeconds = this.durationSeconds;

    this.obstacles = this.config.voyage ? voyageObstacles(this.config.voyage.map) : structuredClone(DEFAULT_ISLAND_OBSTACLES);
    this.salvage = new RepairSalvage(this.seed);
    this.navigation = new NavigationField(this.config.arena, this.obstacles);
    this.weaponSystem = new WeaponSystem({
      front: this.config.weaponFront,
      broadsideLeft: this.config.weaponBroadsideLeft,
      broadsideRight: this.config.weaponBroadsideRight,
    });
    this.spawner = new EnemySpawner(this.config.spawner, this.seed);
    this.replay = new ReplaySession(this.seed, this.config, options.replay);

    this.player = this.createPlayerShip();
    if (this.mode === 'training') this.obstacles = [];
    this.setupAutoPauseListeners();

    if (exposeTestHarness && typeof window !== 'undefined') {
      (window as any).__PIRATE_SIMULATION__ = this;
    }
  }

  public createPlayerShip(): PlayerShipState {
    const startX = this.config.arena.width * 0.5;
    const startY = this.config.arena.height * 0.8;
    return {
      id: 'player_ship',
      type: 'player',
      series: 1,
      health: this.config.playerMaxHealth,
      maxHealth: this.config.playerMaxHealth,
      isDestroyed: false,
      damageTier: 1,
      cooldownFront: 0,
      cooldownLeftBroadside: 0,
      cooldownRightBroadside: 0,
      kinematic: createKinematicState(startX, startY, 0),
    };
  }

  /**
   * Subscribes to internal simulation events.
   */
  public addListener(listener: SimulationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(type: string, payload?: any): void {
    for (const listener of this.listeners) {
      listener({ type, payload });
    }
  }

  /**
   * Sets current player control inputs.
   * If paused or ended, gameplay control inputs are rejected.
   */
  public setInputs(inputs: Partial<PlayerInputState>, source = 'default'): void {
    if (this.isPaused || this.isEnded || this.mode === 'replay') {
      return;
    }
    if (inputs.fireFront) this.latchedFireFront = true;
    if (inputs.fireBroadsideLeft) this.latchedFireBroadsideLeft = true;
    if (inputs.fireBroadsideRight) this.latchedFireBroadsideRight = true;
    this.inputSources.set(source, {
      ...(this.inputSources.get(source) ?? DEFAULT_PLAYER_INPUT),
      ...inputs,
    });
    const combined = { ...DEFAULT_PLAYER_INPUT };
    for (const state of this.inputSources.values()) {
      combined.throttle = Math.max(combined.throttle, state.throttle);
      combined.steer += state.steer;
      combined.fireFront ||= state.fireFront;
      combined.fireBroadsideLeft ||= state.fireBroadsideLeft;
      combined.fireBroadsideRight ||= state.fireBroadsideRight;
    }
    combined.steer = Math.max(-1, Math.min(1, combined.steer));
    this.currentInput = combined;
  }

  /**
   * Clears all held inputs to prevent input buffering accumulation.
   */
  public clearInputs(): void {
    this.inputSources.clear();
    this.currentInput = { ...DEFAULT_PLAYER_INPUT };
    this.latchedFireFront = false;
    this.latchedFireBroadsideLeft = false;
    this.latchedFireBroadsideRight = false;
  }

  /**
   * Advances simulation with real-time delta via the Fixed Timestep Accumulator pattern.
   */
  public update(frameDeltaSeconds: number): void {
    if (this.isPaused || this.isEnded) {
      return;
    }

    if (!Number.isFinite(frameDeltaSeconds) || frameDeltaSeconds <= 0) return;
    let delta = frameDeltaSeconds;
    // Spiral of death prevention
    if (delta > this.maxAccumulator) {
      delta = this.maxAccumulator;
    }

    const speed = this.mode === 'replay' ? this.replay.speed : 1;
    // Cap the backlog too: below the sub-step budget's frame rate it would otherwise grow
    // without bound and fast-forward the battle once rendering recovers.
    this.accumulator = Math.min(
      this.accumulator + delta * speed,
      this.maxAccumulator * Math.max(1, speed),
    );
    // Allow fast playback on 30 Hz displays while keeping catch-up work bounded.
    const stepLimit = this.maxSubSteps * Math.max(1, speed);

    let subSteps = 0;
    while (this.accumulator >= this.fixedTimestep && subSteps < stepLimit && !this.isEnded) {
      this.step(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
      subSteps++;
    }

    // Alpha interpolation factor for smooth rendering
    this.alpha = Math.min(1, this.accumulator / this.fixedTimestep);
  }

  /**
   * Single deterministic physics step (dt = 1/60s).
   */
  public step(dt: number): void {
    if (this.isPaused || this.isEnded || !Number.isFinite(dt) || dt <= 0) {
      return;
    }
    const input = this.replay.inputForTick(
      this.tickCount + 1,
      {
        ...this.currentInput,
        fireFront: this.currentInput.fireFront || this.latchedFireFront,
        fireBroadsideLeft: this.currentInput.fireBroadsideLeft || this.latchedFireBroadsideLeft,
        fireBroadsideRight: this.currentInput.fireBroadsideRight || this.latchedFireBroadsideRight,
      },
      this.mode === 'match',
    );
    this.latchedFireFront = false;
    this.latchedFireBroadsideLeft = false;
    this.latchedFireBroadsideRight = false;
    stepCombat(this, dt, input);
    if (this.mode === 'training') this.training.advance(this);
    this.replay.finishTick(this);
  }

  public getReplay(): BattleReplay | null {
    return this.replay.export(this);
  }

  public resetTrainingLesson(): void {
    this.training.reset(this);
  }

  /**
   * Pauses the simulation. Freezes timers, physics, spawner, and clears input buffer.
   */
  public pause(): void {
    if (this.isPaused || this.isEnded) return;
    this.isPaused = true;
    this.clearInputs();
    this.accumulator = 0;
    this.emit('match_paused');
  }

  /**
   * Resumes the simulation. Guarantees fresh slate with zero buffered inputs.
   */
  public resume(): void {
    if (!this.isPaused || this.isEnded) return;
    this.isPaused = false;
    this.clearInputs();
    this.accumulator = 0;
    this.emit('match_resumed');
  }

  /**
   * Ends match with specified reason ('time_expired' | 'player_destroyed').
   */
  public endMatch(reason: MatchEndReason): void {
    if (this.isEnded) return;
    this.isEnded = true;
    this.endReason = reason;
    this.clearInputs();
    if (reason === 'player_destroyed') this.emit('ship_sunk', this.player);
    this.emit('match_ended', {
      reason,
      finalScore: this.score,
      durationSeconds: this.durationSeconds - this.remainingSeconds,
      config: this.config,
      report: battleReport(this.stats, this.score, this.player.health, this.player.maxHealth, reason === 'time_expired'),
    });
  }

  /**
   * Abandons match mid-game (e.g. reload or back to menu).
   * Discards session so it is NEVER recorded to history or ranking.
   */
  public abandonMatch(): void {
    this.isEnded = true;
    this.endReason = 'abandoned';
    this.clearInputs();
    this.emit('match_abandoned');
    this.destroy();
  }

  /**
   * Resets simulation for a clean new match.
   */
  public restart(customConfig?: Partial<GameplayConfig>): void {
    if (customConfig) {
      const validated = validateGameplayConfig(customConfig);
      this.config = validated.validatedConfig;
      if (customConfig.voyage) {
        if (!isVoyageRules(customConfig.voyage)) throw new Error('Invalid voyage selection.');
        this.config = voyageGameplayConfig(this.config.sessionDurationSeconds, this.config.spawner.spawnIntervalSeconds, customConfig.voyage);
      }
    }
    this.durationSeconds = this.config.sessionDurationSeconds;
    this.remainingSeconds = this.durationSeconds;
    this.elapsedSeconds = 0;
    this.tickCount = 0;
    this.score = 0;
    this.accumulator = 0;
    this.alpha = 0;
    this.isPaused = false;
    this.isEnded = false;
    this.endReason = null;

    this.enemies = [];
    this.projectiles = [];
    this.stats = emptyBattleStats();
    this.salvage = new RepairSalvage(this.seed);
    this.obstacles = this.mode === 'training' ? [] : this.config.voyage ? voyageObstacles(this.config.voyage.map) : structuredClone(DEFAULT_ISLAND_OBSTACLES);
    this.navigation = new NavigationField(this.config.arena, this.obstacles);
    this.weaponSystem = new WeaponSystem({
      front: this.config.weaponFront,
      broadsideLeft: this.config.weaponBroadsideLeft,
      broadsideRight: this.config.weaponBroadsideRight,
    });
    this.spawner = new EnemySpawner(this.config.spawner, this.seed);
    this.entityCounters = { enemy: 0, projectile: 0 };
    this.replay.reset(this.seed, this.config);
    this.training.stage = 'move';
    this.player = this.createPlayerShip();
    this.clearInputs();
  }

  /**
   * Retrieves high-performance match snapshot without triggering React re-renders.
   */
  public getSnapshot(): MatchSnapshot {
    return {
      score: this.score,
      remainingSeconds: Math.ceil(this.remainingSeconds),
      durationSeconds: this.durationSeconds,
      playerHealth: this.player.health,
      playerMaxHealth: this.player.maxHealth,
      isPaused: this.isPaused,
      isEnded: this.isEnded,
      endReason: this.endReason,
      cooldownFrontNormalized: this.weaponSystem.getCooldownFraction('front'),
      cooldownLeftBroadsideNormalized: this.weaponSystem.getCooldownFraction('broadside_left'),
      cooldownRightBroadsideNormalized: this.weaponSystem.getCooldownFraction('broadside_right'),
      activeEnemiesCount: this.enemies.filter((e) => !e.isDestroyed).length,
    };
  }

  /**
   * Retrieves detailed state for deterministic test inspection and Playwright verification.
   */
  public getDebugState(): SimulationDebugState {
    return {
      tickCount: this.tickCount,
      elapsedSeconds: this.elapsedSeconds,
      remainingSeconds: this.remainingSeconds,
      score: this.score,
      player: {
        x: this.player.kinematic.x,
        y: this.player.kinematic.y,
        rotation: this.player.kinematic.rotation,
        health: this.player.health,
        damageTier: this.player.damageTier,
        velocityX: this.player.kinematic.velocityX,
        velocityY: this.player.kinematic.velocityY,
      },
      enemies: this.enemies.map((e) => ({
        id: e.id,
        type: e.type,
        x: e.kinematic.x,
        y: e.kinematic.y,
        rotation: e.kinematic.rotation,
        health: e.health,
        damageTier: e.damageTier,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        owner: p.owner,
        x: p.x,
        y: p.y,
        damage: p.damage,
      })),
    };
  }

  /**
   * Sets up window blur and visibilitychange listeners for automatic pause.
   */
  private setupAutoPauseListeners(): void {
    if (typeof window === 'undefined') return;

    const onBlur = () => {
      this.pause();
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.pause();
      }
    };

    window.addEventListener('blur', onBlur);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    this.cleanupWindowListeners = () => {
      window.removeEventListener('blur', onBlur);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }

  /**
   * Disposes all listeners and resources.
   */
  public destroy(): void {
    if (this.cleanupWindowListeners) {
      this.cleanupWindowListeners();
      this.cleanupWindowListeners = null;
    }
    this.listeners.clear();
    this.clearInputs();
    if (typeof window !== 'undefined' && (window as any).__PIRATE_SIMULATION__ === this) {
      delete (window as any).__PIRATE_SIMULATION__;
    }
  }
}
