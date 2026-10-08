/**
 * Core Domain Types: Game Simulation, Entities, Kinematics, Weapons, Collisions & Events
 */

import type { GameplayConfig } from './config';

export interface Vector2D {
  x: number;
  y: number;
}

export interface KinematicState {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  rotation: number;         // heading in radians (0 = North, clockwise positive)
  prevRotation: number;
  velocityX: number;        // px/s
  velocityY: number;        // px/s
  angularVelocity: number;   // rad/s
}

export interface ShipPhysicsConfig {
  readonly maxForwardSpeed: number;   // px/s
  readonly acceleration: number;      // px/s²
  readonly turnRate: number;          // rad/s
  readonly longitudinalDrag: number;  // s⁻¹
  readonly lateralDrag: number;       // s⁻¹
  readonly reverseAllowed: boolean;
}

export type DamageTier = 1 | 2 | 3 | 4;

export type ShipSeries = 1 | 2 | 3 | 4 | 5 | 6;

export type EntityType = 'player' | 'chaser' | 'shooter' | 'projectile' | 'obstacle';

export type WeaponType = 'front' | 'broadside_left' | 'broadside_right';

export interface Projectile {
  id: number;
  owner: 'player' | 'enemy';
  weaponType: WeaponType;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  remainingLife: number; // in seconds
  isDead: boolean;
}

export interface ShipState {
  id: string;
  type: 'player' | 'chaser' | 'shooter';
  series: ShipSeries;
  kinematic: KinematicState;
  health: number;
  maxHealth: number;
  isDestroyed: boolean;
  damageTier: DamageTier;
}

export interface PlayerShipState extends ShipState {
  type: 'player';
  cooldownFront: number;
  cooldownLeftBroadside: number;
  cooldownRightBroadside: number;
}

export type ChaserAIPhase = 'pursuit' | 'detonating' | 'dead';
export type ShooterAIPhase = 'approach' | 'engage' | 'evade';

export interface ChaserEnemyState extends ShipState {
  type: 'chaser';
  aiType: 'chaser';
  phase: ChaserAIPhase;
  chargeStage?: 'loading' | 'charging';
  chargeSeconds?: number;
  chargeHeading?: number;
}

export interface ShooterEnemyState extends ShipState {
  type: 'shooter';
  aiType: 'shooter';
  phase: ShooterAIPhase;
  cooldownFront: number;
  attackWindup?: number;
}

export type EnemyShipState = ChaserEnemyState | ShooterEnemyState;

export interface CircleCollider {
  x: number;
  y: number;
  radius: number;
}

export interface DualDiskCapsuleCollider {
  disk1: CircleCollider;
  disk2: CircleCollider;
}

export interface IslandObstacle {
  id: string;
  x: number;
  y: number;
  radius: number;
  tileIds: number[];
}

export interface ArenaBounds {
  width: number;
  height: number;
  margin: number;
}

export interface CollisionResult {
  hasCollision: boolean;
  normalX: number;
  normalY: number;
  depth: number;
}

export type MatchEndReason = 'time_expired' | 'player_destroyed' | 'abandoned';

export type MatchEvent =
  | { type: 'score_changed'; score: number }
  | { type: 'health_changed'; current: number; max: number; percentage: number }
  | { type: 'time_tick'; remainingSeconds: number }
  | { type: 'match_ended'; reason: MatchEndReason; finalScore: number; durationSeconds: number; config: GameplayConfig }
  | { type: 'cooldown_updated'; weapon: WeaponType; progress: number }
  | { type: 'enemy_destroyed'; enemyType: 'chaser' | 'shooter'; scoreAwarded: number; position: Vector2D }
  | { type: 'projectile_spawned'; projectile: Projectile }
  | { type: 'explosion_spawned'; x: number; y: number; size: 'small' | 'large' };

export interface MatchSnapshot {
  score: number;
  remainingSeconds: number;
  durationSeconds: number;
  playerHealth: number;
  playerMaxHealth: number;
  isPaused: boolean;
  isEnded: boolean;
  endReason: MatchEndReason | null;
  cooldownFrontNormalized: number;          // 0.0 (ready) to 1.0 (cooling down)
  cooldownLeftBroadsideNormalized: number;
  cooldownRightBroadsideNormalized: number;
  activeEnemiesCount: number;
}

export interface SimulationDebugState {
  tickCount: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  score: number;
  player: {
    x: number;
    y: number;
    rotation: number;
    health: number;
    damageTier: DamageTier;
    velocityX: number;
    velocityY: number;
  };
  enemies: Array<{
    id: string;
    type: 'chaser' | 'shooter';
    x: number;
    y: number;
    rotation: number;
    health: number;
    damageTier: DamageTier;
  }>;
  projectiles: Array<{
    id: number;
    owner: 'player' | 'enemy';
    x: number;
    y: number;
    damage: number;
  }>;
}

export interface SimulationHarness {
  setSeed(seed: number): void;
  step(dt: number): void;
  getState(): SimulationDebugState;
  spawnEnemy(type: 'chaser' | 'shooter', x?: number, y?: number): void;
  setPlayerHealth(hp: number): void;
  setTimeRemaining(seconds: number): void;
}
