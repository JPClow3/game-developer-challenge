import type {
  SpawnerConfig,
  KinematicState,
  EnemyShipState,
  IslandObstacle,
  ArenaBounds,
  Vector2D,
} from '../../types';
import { DEFAULT_SPAWNER_CONFIG, clampSpawnInterval } from '../../types';
import { ChaserAI } from '../ai/ChaserAI';
import { ShooterAI } from '../ai/ShooterAI';

/**
 * Deterministic Mulberry32 Seeded Pseudo-Random Number Generator.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed: number = 1337) {
    this.state = (seed === 0 ? 1 : seed) >>> 0;
  }

  public setSeed(seed: number): void {
    this.state = (seed === 0 ? 1 : seed) >>> 0;
  }

  /**
   * Returns a pseudo-random float in [0, 1).
   */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns a pseudo-random float in [min, max).
   */
  public nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

/**
 * EnemySpawner handles periodic deterministic enemy generation,
 * ensuring safe clearance from player and obstacles, entity density capping,
 * and balanced archetype rotation.
 */
export class EnemySpawner {
  public spawnCooldown: number;
  public prng: SeededPRNG;
  private readonly config: SpawnerConfig;

  constructor(config?: Partial<SpawnerConfig>, seed: number = 1337) {
    const baseInterval =
      config?.spawnIntervalSeconds ?? DEFAULT_SPAWNER_CONFIG.spawnIntervalSeconds;
    this.config = {
      ...DEFAULT_SPAWNER_CONFIG,
      ...config,
      spawnIntervalSeconds: clampSpawnInterval(baseInterval),
    };
    this.spawnCooldown = this.config.spawnIntervalSeconds;
    this.prng = new SeededPRNG(seed);
  }

  public setSeed(seed: number): void {
    this.prng.setSeed(seed);
  }

  public resetCooldown(): void {
    this.spawnCooldown = this.config.spawnIntervalSeconds;
  }

  /**
   * Advances spawner clock. If interval elapses and density cap is not reached,
   * generates a safe candidate position and instantiates a new EnemyShip.
   */
  public step(
    dt: number,
    playerKinematic: KinematicState,
    currentEnemies: EnemyShipState[],
    obstacles: IslandObstacle[],
    arena: ArenaBounds,
  ): EnemyShipState | null {
    if (dt <= 0) return null;

    this.spawnCooldown -= dt;
    if (this.spawnCooldown > 0) return null;

    // Reset cooldown for next interval
    this.spawnCooldown = this.config.spawnIntervalSeconds;

    // 1. Density cap check (max 10 active enemies)
    const activeEnemies = currentEnemies.filter((e) => !e.isDestroyed);
    if (activeEnemies.length >= this.config.maxActiveEnemies) {
      return null;
    }

    // 2. Find safe candidate position
    const pos = this.findSafeSpawnPosition(playerKinematic, obstacles, arena);
    if (!pos) {
      return null;
    }

    // 3. Archetype selection: guarantee both appear during match
    const type = this.selectEnemyType(activeEnemies);

    // Initial heading points roughly towards center of arena
    const toCenterX = arena.width * 0.5 - pos.x;
    const toCenterY = arena.height * 0.5 - pos.y;
    const heading = Math.atan2(toCenterX, -toCenterY);

    return type === 'chaser'
      ? ChaserAI.create(pos.x, pos.y, heading)
      : ShooterAI.create(pos.x, pos.y, heading);
  }

  /**
   * Force spawns an enemy of specified archetype at given coordinates or safe generated coordinates.
   */
  public forceSpawn(
    type: 'chaser' | 'shooter',
    x?: number,
    y?: number,
    playerKinematic?: KinematicState,
    obstacles?: IslandObstacle[],
    arena?: ArenaBounds,
  ): EnemyShipState {
    let spawnX = x;
    let spawnY = y;

    if (spawnX === undefined || spawnY === undefined) {
      const fallbackPlayer: KinematicState = playerKinematic || {
        x: 800,
        y: 500,
        rotation: 0,
        prevX: 800,
        prevY: 500,
        prevRotation: 0,
        velocityX: 0,
        velocityY: 0,
        angularVelocity: 0,
      };
      const fallbackArena = arena || { width: 1600, height: 1000, margin: 40 };
      const fallbackObs = obstacles || [];
      const pos = this.findSafeSpawnPosition(fallbackPlayer, fallbackObs, fallbackArena);
      spawnX = pos ? pos.x : 200;
      spawnY = pos ? pos.y : 200;
    }

    return type === 'chaser'
      ? ChaserAI.create(spawnX, spawnY, 0)
      : ShooterAI.create(spawnX, spawnY, 0);
  }

  /**
   * Selects enemy archetype:
   * Guarantees both types appear by prioritizing the missing archetype.
   */
  public selectEnemyType(activeEnemies: EnemyShipState[]): 'chaser' | 'shooter' {
    const chaserCount = activeEnemies.filter((e) => e.type === 'chaser').length;
    const shooterCount = activeEnemies.filter((e) => e.type === 'shooter').length;

    if (chaserCount === 0) return 'chaser';
    if (shooterCount === 0) return 'shooter';

    const rand = this.prng.next();
    return rand < this.config.chaserWeight ? 'chaser' : 'shooter';
  }

  /**
   * Searches for a candidate spawn position that satisfies:
   * - Arena margins [80, W - 80] x [80, H - 80]
   * - Safe player distance (>= 380 px)
   * - Island obstacle clearance
   */
  public findSafeSpawnPosition(
    playerKinematic: KinematicState,
    obstacles: IslandObstacle[],
    arena: ArenaBounds,
  ): Vector2D | null {
    const minMargin = 80;
    const minX = minMargin;
    const maxX = arena.width - minMargin;
    const minY = minMargin;
    const maxY = arena.height - minMargin;

    const safePlayerDistSq = this.config.safePlayerDistance * this.config.safePlayerDistance;

    // Up to 30 randomized attempts using PRNG
    for (let attempt = 0; attempt < 30; attempt++) {
      const candX = this.prng.nextRange(minX, maxX);
      const candY = this.prng.nextRange(minY, maxY);

      if (this.isLocationSafe(candX, candY, playerKinematic, obstacles, safePlayerDistSq)) {
        return { x: candX, y: candY };
      }
    }

    // Deterministic fallback: scan arena boundary perimeter points
    const perimeterSamples: Vector2D[] = [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: minX, y: maxY },
      { x: maxX, y: maxY },
      { x: arena.width * 0.5, y: minY },
      { x: arena.width * 0.5, y: maxY },
      { x: minX, y: arena.height * 0.5 },
      { x: maxX, y: arena.height * 0.5 },
    ];

    for (const p of perimeterSamples) {
      if (this.isLocationSafe(p.x, p.y, playerKinematic, obstacles, safePlayerDistSq)) {
        return p;
      }
    }

    return null;
  }

  private isLocationSafe(
    x: number,
    y: number,
    playerKinematic: KinematicState,
    obstacles: IslandObstacle[],
    safePlayerDistSq: number,
  ): boolean {
    // 1. Player safe distance check
    const dx = x - playerKinematic.x;
    const dy = y - playerKinematic.y;
    if (dx * dx + dy * dy < safePlayerDistSq) {
      return false;
    }

    // 2. Obstacle clearance check
    for (const obs of obstacles) {
      const dist = Math.hypot(x - obs.x, y - obs.y);
      const minClearance = obs.radius + this.config.islandClearance + 20;
      if (dist < minClearance) {
        return false;
      }
    }

    return true;
  }
}
