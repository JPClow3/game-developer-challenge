import type {
  GameplayConfig,
  PlayerShipState,
  EnemyShipState,
  Projectile,
  IslandObstacle,
  MatchEndReason,
  MatchSnapshot,
  SimulationDebugState,
  ChaserEnemyState,
  ShooterEnemyState,
} from '../../types';
import { validateGameplayConfig } from '../../types';
import { ShipKinematics, createKinematicState } from '../kinematics/ShipKinematics';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { EnemySpawner } from '../spawner/EnemySpawner';
import { ChaserAI, computeDamageTier } from '../ai/ChaserAI';
import { ShooterAI } from '../ai/ShooterAI';
import {
  CollisionSystem,
  DEFAULT_ISLAND_OBSTACLES,
} from '../collision/CollisionSystem';

export interface PlayerInputState {
  throttle: number; // 0 to 1
  steer: number;    // -1 to 1
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

export type SimulationListener = (event: {
  type: string;
  payload?: any;
}) => void;

/**
 * GameSimulation: Pure TypeScript combat simulation engine.
 * Fixed timestep loop (dt = 1/60s), accumulator, sub-step clamp 5, alpha interpolation factor.
 * Session duration timer, deterministic collision, decoupled state sync, anti-input buffering.
 */
export class GameSimulation {
  public readonly config: GameplayConfig;
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

  public weaponSystem: WeaponSystem;
  public spawner: EnemySpawner;

  private currentInput: PlayerInputState = { ...DEFAULT_PLAYER_INPUT };
  private inputSources = new Map<string, PlayerInputState>();
  private latchedFireFront = false;
  private latchedFireBroadsideLeft = false;
  private latchedFireBroadsideRight = false;
  private listeners: Set<SimulationListener> = new Set();
  private cleanupWindowListeners: (() => void) | null = null;

  constructor(customConfig?: Partial<GameplayConfig>, seed: number = 1337) {
    const validated = validateGameplayConfig(customConfig);
    this.config = validated.validatedConfig;
    this.durationSeconds = this.config.sessionDurationSeconds;
    this.remainingSeconds = this.durationSeconds;

    this.obstacles = [...DEFAULT_ISLAND_OBSTACLES];
    this.weaponSystem = new WeaponSystem({
      front: this.config.weaponFront,
      broadsideLeft: this.config.weaponBroadsideLeft,
      broadsideRight: this.config.weaponBroadsideRight,
    });
    this.spawner = new EnemySpawner(this.config.spawner, seed);

    this.player = this.initPlayerShip();
    this.setupAutoPauseListeners();

    if (typeof window !== 'undefined') {
      (window as any).__PIRATE_SIMULATION__ = this;
    }
  }

  private initPlayerShip(): PlayerShipState {
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

  private emit(type: string, payload?: any): void {
    for (const listener of this.listeners) {
      listener({ type, payload });
    }
  }

  /**
   * Sets current player control inputs.
   * If paused or ended, gameplay control inputs are rejected.
   */
  public setInputs(inputs: Partial<PlayerInputState>, source = 'default'): void {
    if (this.isPaused || this.isEnded) {
      return;
    }
    if (inputs.fireFront) this.latchedFireFront = true;
    if (inputs.fireBroadsideLeft) this.latchedFireBroadsideLeft = true;
    if (inputs.fireBroadsideRight) this.latchedFireBroadsideRight = true;
    this.inputSources.set(source, { ...(this.inputSources.get(source) ?? DEFAULT_PLAYER_INPUT), ...inputs });
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

    let delta = frameDeltaSeconds;
    // Spiral of death prevention
    if (delta > this.maxAccumulator) {
      delta = this.maxAccumulator;
    }

    this.accumulator += delta;

    let subSteps = 0;
    while (this.accumulator >= this.fixedTimestep && subSteps < this.maxSubSteps) {
      this.step(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
      subSteps++;
    }

    // Alpha interpolation factor for smooth rendering
    this.alpha = this.accumulator / this.fixedTimestep;
  }

  /**
   * Single deterministic physics step (dt = 1/60s).
   */
  public step(dt: number): void {
    if (this.isPaused || this.isEnded || dt <= 0) {
      return;
    }

    this.tickCount++;
    this.elapsedSeconds += dt;

    // 1. Session duration countdown
    this.remainingSeconds -= dt;
    if (this.remainingSeconds <= 0) {
      this.remainingSeconds = 0;
      this.endMatch('time_expired');
      return;
    }

    // 2. Decrement weapon cooldowns
    this.weaponSystem.stepCooldowns(dt);
    this.player.cooldownFront = this.weaponSystem.cooldownFront;
    this.player.cooldownLeftBroadside = this.weaponSystem.cooldownLeftBroadside;
    this.player.cooldownRightBroadside = this.weaponSystem.cooldownRightBroadside;

    // 3. Process player movement kinematics
    ShipKinematics.step(
      this.player.kinematic,
      {
        throttle: this.currentInput.throttle,
        steer: this.currentInput.steer,
      },
      this.config.playerMovement,
      dt,
      this.config.arena
    );

    // 4. Simultaneous player weapon discharges
    const shouldFireFront = this.currentInput.fireFront || this.latchedFireFront;
    this.latchedFireFront = false;
    if (shouldFireFront && this.weaponSystem.canFire('front')) {
      const spawned = this.weaponSystem.fireFront(this.player.kinematic, 'player');
      this.projectiles.push(...spawned);
      for (const p of spawned) this.emit('projectile_spawned', p);
    }

    const shouldFireLeft = this.currentInput.fireBroadsideLeft || this.latchedFireBroadsideLeft;
    this.latchedFireBroadsideLeft = false;
    if (shouldFireLeft && this.weaponSystem.canFire('broadside_left')) {
      const spawned = this.weaponSystem.fireBroadsideLeft(this.player.kinematic, 'player');
      this.projectiles.push(...spawned);
      for (const p of spawned) this.emit('projectile_spawned', p);
    }

    const shouldFireRight = this.currentInput.fireBroadsideRight || this.latchedFireBroadsideRight;
    this.latchedFireBroadsideRight = false;
    if (shouldFireRight && this.weaponSystem.canFire('broadside_right')) {
      const spawned = this.weaponSystem.fireBroadsideRight(this.player.kinematic, 'player');
      this.projectiles.push(...spawned);
      for (const p of spawned) this.emit('projectile_spawned', p);
    }

    // 5. Update enemy AI subsystems
    for (const enemy of this.enemies) {
      if (enemy.isDestroyed) continue;

      if (enemy.type === 'chaser') {
        ChaserAI.update(
          enemy as ChaserEnemyState,
          this.player.kinematic,
          this.obstacles,
          dt,
          this.config.arena
        );
      } else if (enemy.type === 'shooter') {
        const shot = ShooterAI.update(
          enemy as ShooterEnemyState,
          this.player.kinematic,
          this.obstacles,
          dt,
          this.config.arena
        );
        if (shot) {
          this.projectiles.push(shot);
          this.emit('projectile_spawned', shot);
        }
      }
    }

    // 6. Enemy Spawner tick
    const newEnemy = this.spawner.step(
      dt,
      this.player.kinematic,
      this.enemies,
      this.obstacles,
      this.config.arena
    );
    if (newEnemy) {
      this.enemies.push(newEnemy);
      this.emit('enemy_spawned', newEnemy);
    }

    // 7. Projectile kinematics update
    this.projectiles = WeaponSystem.stepProjectiles(
      this.projectiles,
      dt,
      this.config.arena
    );

    // 8. Collision detection & resolution
    // A. Island Obstacle Collisions (Tangent sliding)
    CollisionSystem.resolveShipObstacleCollisions(this.player.kinematic, this.obstacles);
    for (const enemy of this.enemies) {
      if (!enemy.isDestroyed) {
        CollisionSystem.resolveShipObstacleCollisions(
          enemy.kinematic,
          this.obstacles
        );
      }
    }

    // B. Arena Boundary Collisions (Tangent sliding)
    CollisionSystem.resolveShipArenaCollisions(this.player.kinematic, this.config.arena);
    for (const enemy of this.enemies) {
      if (!enemy.isDestroyed) {
        CollisionSystem.resolveShipArenaCollisions(
          enemy.kinematic,
          this.config.arena
        );
      }
    }

    // C. Ship-to-Ship Ramming & Separation
    const shipShipResult = CollisionSystem.resolveShipShipCollisions(
      this.player,
      this.enemies
    );

    if (shipShipResult.playerDamaged) {
      this.player.damageTier = computeDamageTier(this.player.health, this.player.maxHealth);
      this.emit('health_changed', {
        current: this.player.health,
        max: this.player.maxHealth,
        percentage: (this.player.health / this.player.maxHealth) * 100,
      });
      if (this.player.health <= 0) {
        this.player.isDestroyed = true;
        this.endMatch('player_destroyed');
        return;
      }
    }

    // D. Projectile Collisions (Single-hit guarantee)
    const projResult = CollisionSystem.resolveProjectileCollisions(
      this.projectiles,
      this.player,
      this.enemies,
      this.obstacles
    );

    if (projResult.scoreAwarded > 0) {
      this.score += projResult.scoreAwarded;
      this.emit('score_changed', { score: this.score });
    }

    if (projResult.playerDamaged) {
      this.player.damageTier = computeDamageTier(this.player.health, this.player.maxHealth);
      this.emit('health_changed', {
        current: this.player.health,
        max: this.player.maxHealth,
        percentage: (this.player.health / this.player.maxHealth) * 100,
      });
      if (this.player.health <= 0) {
        this.player.isDestroyed = true;
        this.endMatch('player_destroyed');
        return;
      }
    }

    // 9. Prune destroyed enemies & dead projectiles
    this.enemies = this.enemies.filter((e) => !e.isDestroyed);
    this.projectiles = this.projectiles.filter((p) => !p.isDead);

    // 10. Update player damage tier
    this.player.damageTier = computeDamageTier(this.player.health, this.player.maxHealth);
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
    this.emit('match_ended', {
      reason,
      finalScore: this.score,
      durationSeconds: this.durationSeconds - this.remainingSeconds,
      config: this.config,
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
      (this as any).config = validated.validatedConfig;
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
    this.weaponSystem.reset();
    this.spawner.resetCooldown();
    this.player = this.initPlayerShip();
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
