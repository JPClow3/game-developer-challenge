import { describe, it, expect } from 'vitest';
import {
  EnemySpawner,
  SeededPRNG,
} from '../../../src/core/spawner/EnemySpawner';
import { createKinematicState } from '../../../src/core/kinematics/ShipKinematics';
import {
  DEFAULT_ARENA_CONFIG,
  DEFAULT_SPAWNER_CONFIG,
} from '../../../src/types';
import type { IslandObstacle, EnemyShipState } from '../../../src/types';
import { ChaserAI } from '../../../src/core/ai/ChaserAI';

describe('EnemySpawner Subsystem', () => {
  const arena = DEFAULT_ARENA_CONFIG;
  const obstacles: IslandObstacle[] = [
    { id: 'island_1', x: 600, y: 350, radius: 85, tileIds: [] },
    { id: 'island_2', x: 1050, y: 650, radius: 95, tileIds: [] },
  ];

  it('provides deterministic random sequences with SeededPRNG', () => {
    const prng1 = new SeededPRNG(42);
    const prng2 = new SeededPRNG(42);

    for (let i = 0; i < 20; i++) {
      expect(prng1.next()).toBe(prng2.next());
    }
  });

  it('respects configurable spawn interval (validated positive, default 3s)', () => {
    const spawner = new EnemySpawner({ spawnIntervalSeconds: 3.0 }, 100);
    const player = createKinematicState(800, 500, 0);

    // Step 1 second
    const e1 = spawner.step(1.0, player, [], obstacles, arena);
    expect(e1).toBeNull(); // 2s remaining

    // Step another 1 second
    const e2 = spawner.step(1.0, player, [], obstacles, arena);
    expect(e2).toBeNull(); // 1s remaining

    // Step another 1.1 seconds (total 3.1s > 3.0s)
    const e3 = spawner.step(1.1, player, [], obstacles, arena);
    expect(e3).not.toBeNull(); // Spawned!
  });

  it('guarantees safe distance from player (>= 380px) for all spawns', () => {
    const spawner = new EnemySpawner({ spawnIntervalSeconds: 1.0 }, 999);
    const player = createKinematicState(800, 500, 0);
    const enemies: EnemyShipState[] = [];

    for (let i = 0; i < 20; i++) {
      spawner.spawnCooldown = 0; // Force immediate interval
      const spawned = spawner.step(0.1, player, enemies, obstacles, arena);
      if (spawned) {
        const distToPlayer = Math.hypot(spawned.kinematic.x - player.x, spawned.kinematic.y - player.y);
        expect(distToPlayer).toBeGreaterThanOrEqual(DEFAULT_SPAWNER_CONFIG.safePlayerDistance - 0.01);
      }
    }
  });

  it('guarantees clearance from island obstacles for all spawns', () => {
    const spawner = new EnemySpawner({ spawnIntervalSeconds: 1.0 }, 777);
    const player = createKinematicState(200, 200, 0);

    for (let i = 0; i < 25; i++) {
      const pos = spawner.findSafeSpawnPosition(player, obstacles, arena);
      expect(pos).not.toBeNull();
      if (pos) {
        for (const obs of obstacles) {
          const dist = Math.hypot(pos.x - obs.x, pos.y - obs.y);
          expect(dist).toBeGreaterThanOrEqual(obs.radius + DEFAULT_SPAWNER_CONFIG.islandClearance);
        }
      }
    }
  });

  it('enforces entity density cap (max 10 active enemies)', () => {
    const spawner = new EnemySpawner({ spawnIntervalSeconds: 1.0, maxActiveEnemies: 10 }, 123);
    const player = createKinematicState(800, 500, 0);

    // Create 10 active enemies
    const activeEnemies: EnemyShipState[] = [];
    for (let i = 0; i < 10; i++) {
      activeEnemies.push(ChaserAI.create(100 + i * 20, 100, 0));
    }

    spawner.spawnCooldown = 0;
    const result = spawner.step(1.0, player, activeEnemies, obstacles, arena);
    expect(result).toBeNull(); // Capped!

    // Destroy one enemy
    activeEnemies[0]!.isDestroyed = true;
    const resultAfterKill = spawner.step(1.0, player, activeEnemies, obstacles, arena);
    expect(resultAfterKill).not.toBeNull(); // Now can spawn again!
  });

  it('guarantees both enemy archetypes (Chaser & Shooter) appear during a match', () => {
    const spawner = new EnemySpawner({ spawnIntervalSeconds: 1.0 }, 555);
    const player = createKinematicState(800, 500, 0);

    // 1. With empty enemies list, should spawn Chaser first
    const first = spawner.step(2.0, player, [], obstacles, arena);
    expect(first).not.toBeNull();
    expect(first!.type).toBe('chaser');

    // 2. With only Chasers present, should prioritize Shooter
    const chasersOnly: EnemyShipState[] = [first!];
    spawner.spawnCooldown = 0;
    const second = spawner.step(2.0, player, chasersOnly, obstacles, arena);
    expect(second).not.toBeNull();
    expect(second!.type).toBe('shooter');
  });
});
