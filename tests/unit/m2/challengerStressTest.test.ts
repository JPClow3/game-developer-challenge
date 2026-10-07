import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShipKinematics,
  createKinematicState,
  getForwardVector,
  getRightVector,
  getLeftVector,
} from '../../../src/core/kinematics/ShipKinematics';
import {
  WeaponSystem,
  resetProjectileIdCounter,
} from '../../../src/core/weapons/WeaponSystem';
import {
  CollisionSystem,
  getShipDualDiskCollider,
  DEFAULT_ISLAND_OBSTACLES,
  DEFAULT_SHIP_DISK_RADIUS,
} from '../../../src/core/collision/CollisionSystem';
import {
  EnemySpawner,
  SeededPRNG,
} from '../../../src/core/spawner/EnemySpawner';
import { ChaserAI } from '../../../src/core/ai/ChaserAI';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import {
  DEFAULT_PLAYER_MOVEMENT,
  DEFAULT_ARENA_CONFIG,
  DEFAULT_SPAWNER_CONFIG,
  DEFAULT_WEAPON_BROADSIDE_LEFT,
  DEFAULT_WEAPON_BROADSIDE_RIGHT,
} from '../../../src/types';
import type {
  ShipState,
  EnemyShipState,
  Projectile,
  IslandObstacle,
  ArenaBounds,
} from '../../../src/types';

describe('Empirical Adversarial Stress Suite: Milestone 2', () => {
  const arena: ArenaBounds = DEFAULT_ARENA_CONFIG;
  const obstacles: IslandObstacle[] = DEFAULT_ISLAND_OBSTACLES;

  beforeEach(() => {
    resetProjectileIdCounter();
  });

  // =========================================================================
  // 1. KINEMATICS STRESS: Extreme velocities, rapid reversals, keel drag
  // =========================================================================
  describe('1. Kinematics Stress & Lateral Drag Keel Damping', () => {
    it('survives rapid directional reversals (steer +1 / -1 alternating) under full throttle without NaN or angular explosion', () => {
      const state = createKinematicState(800, 500, 0);
      const dt = 1 / 60;
      let steerDir = 1;

      for (let frame = 0; frame < 600; frame++) {
        // Reverse steer direction every 10 frames
        if (frame % 10 === 0) {
          steerDir *= -1;
        }

        ShipKinematics.step(
          state,
          { throttle: 1.0, steer: steerDir },
          DEFAULT_PLAYER_MOVEMENT,
          dt,
          arena
        );

        // Verification oracles
        expect(Number.isFinite(state.x)).toBe(true);
        expect(Number.isFinite(state.y)).toBe(true);
        expect(Number.isFinite(state.rotation)).toBe(true);
        expect(Number.isFinite(state.velocityX)).toBe(true);
        expect(Number.isFinite(state.velocityY)).toBe(true);

        // Rotation must stay within wrapped boundaries [-PI, PI]
        expect(state.rotation).toBeGreaterThanOrEqual(-Math.PI - 1e-6);
        expect(state.rotation).toBeLessThanOrEqual(Math.PI + 1e-6);

        // Velocity must not explode
        const speed = Math.hypot(state.velocityX, state.velocityY);
        expect(speed).toBeLessThanOrEqual(DEFAULT_PLAYER_MOVEMENT.maxForwardSpeed + 1e-3);
      }
    });

    it('clamps extreme forward velocity surges to maxForwardSpeed within one step', () => {
      const state = createKinematicState(800, 500, 0);
      // Artificially inject an extreme velocity of 10,000 px/s along heading (North)
      state.velocityY = -10000;
      state.velocityX = 0;

      ShipKinematics.step(
        state,
        { throttle: 1.0, steer: 0 },
        DEFAULT_PLAYER_MOVEMENT,
        1 / 60,
        arena
      );

      const forwardSpeed = -state.velocityY;
      expect(forwardSpeed).toBeLessThanOrEqual(DEFAULT_PLAYER_MOVEMENT.maxForwardSpeed + 1e-3);
      expect(state.velocityX).toBeCloseTo(0, 5);
    });

    it('exponentially damps extreme lateral velocity (>99% damped in 1s) to eliminate unnatural drift', () => {
      // Facing North (0 rad): Keel is along Y, Lateral/Beam is along X
      const state = createKinematicState(800, 500, 0);
      const initialLateralSpeed = 2000; // Extreme sideways drift
      state.velocityX = initialLateralSpeed;
      state.velocityY = 0; // Zero forward speed

      const dt = 1 / 60;
      // Step for 1 second (60 frames) with neutral controls (throttle 0, steer 0)
      for (let frame = 0; frame < 60; frame++) {
        ShipKinematics.step(
          state,
          { throttle: 0, steer: 0 },
          DEFAULT_PLAYER_MOVEMENT,
          dt,
          arena
        );
      }

      // Theoretical damping after 60 ticks with c_lat = 5.5:
      // (1 - 5.5 / 60)^60 ≈ 0.00334 (99.66% reduction)
      expect(Math.abs(state.velocityX)).toBeLessThan(initialLateralSpeed * 0.01);
      expect(Math.abs(state.velocityX)).toBeLessThan(10); // Under 10 px/s
    });

    it('enforces non-negative forward speed when reverseAllowed is false', () => {
      const state = createKinematicState(800, 500, 0);
      // Inject negative forward velocity (moving backwards)
      state.velocityY = 500; // Facing North, positive Y is backward

      ShipKinematics.step(
        state,
        { throttle: 0, steer: 0 },
        DEFAULT_PLAYER_MOVEMENT,
        1 / 60,
        arena
      );

      // Facing North, forwardSpeed = -velocityY. Must not be negative!
      const f = getForwardVector(state.rotation);
      const forwardSpeed = state.velocityX * f.x + state.velocityY * f.y;
      expect(forwardSpeed).toBeGreaterThanOrEqual(0);
    });

    it('handles extreme velocity impacts with boundary margins without escaping', () => {
      // Ship at margin + 2px facing West
      const state = createKinematicState(arena.margin + 2, 500, -Math.PI / 2); // Facing West
      state.velocityX = -5000; // Extreme outward speed

      // In one tick (1/60s), forward speed (220 px/s) would move it by ~3.67px to x ≈ 38.33 (< margin 40)
      ShipKinematics.step(
        state,
        { throttle: 1, steer: 0 },
        DEFAULT_PLAYER_MOVEMENT,
        1 / 60,
        arena
      );

      // Must be clamped to arena.margin and outward negative velocity cancelled
      expect(state.x).toBe(arena.margin);
      expect(state.velocityX).toBeGreaterThanOrEqual(0); // Outward velocity cancelled
    });
  });

  // =========================================================================
  // 2. BROADSIDE SALVO GEOMETRY: 3 port & 3 starboard parallel trajectories
  // =========================================================================
  describe('2. Broadside Salvo Geometry & Parallel Trajectories', () => {
    const testHeadings = [
      0, // North
      Math.PI / 4, // North-East
      Math.PI / 2, // East
      (3 * Math.PI) / 4, // South-East
      Math.PI, // South
      -Math.PI / 2, // West
      -Math.PI / 4, // North-West
      1.2345, // Arbitrary angle
      -2.4567, // Arbitrary negative angle
    ];

    it('fires exactly 3 port projectiles with strictly parallel velocities and correct gunport offsets for all headings', () => {
      const weapons = new WeaponSystem();
      const cfg = DEFAULT_WEAPON_BROADSIDE_LEFT;

      for (const heading of testHeadings) {
        weapons.reset();
        const ship = createKinematicState(700, 500, heading);
        const projectiles = weapons.fireBroadsideLeft(ship, 'player');

        expect(projectiles.length).toBe(3);

        const f = getForwardVector(heading);
        const l = getLeftVector(heading);

        const [pFore, pMid, pAft] = projectiles;

        // 1. All 3 must have identical velocity vectors (strictly parallel)
        expect(pFore!.vx).toBeCloseTo(pMid!.vx, 6);
        expect(pFore!.vy).toBeCloseTo(pMid!.vy, 6);
        expect(pMid!.vx).toBeCloseTo(pAft!.vx, 6);
        expect(pMid!.vy).toBeCloseTo(pAft!.vy, 6);

        // 2. Velocity must align with port normal vector (-r or l)
        const vSpeed = Math.hypot(pFore!.vx, pFore!.vy);
        expect(vSpeed).toBeCloseTo(cfg.projectileSpeed, 1);
        const normVx = pFore!.vx / vSpeed;
        const normVy = pFore!.vy / vSpeed;
        expect(normVx).toBeCloseTo(l.x, 5);
        expect(normVy).toBeCloseTo(l.y, 5);

        // 3. Spacing along the forward axis between gunports: Fore (+18px), Mid (0), Aft (-18px)
        const dForeMid = Math.hypot(pFore!.x - pMid!.x, pFore!.y - pMid!.y);
        const dMidAft = Math.hypot(pMid!.x - pAft!.x, pMid!.y - pAft!.y);
        const dForeAft = Math.hypot(pFore!.x - pAft!.x, pFore!.y - pAft!.y);

        expect(dForeMid).toBeCloseTo(cfg.gunportSpacing, 3);
        expect(dMidAft).toBeCloseTo(cfg.gunportSpacing, 3);
        expect(dForeAft).toBeCloseTo(cfg.gunportSpacing * 2, 3);

        // 4. Direction from Mid to Fore gunport must align with forward unit vector f
        const foreDirX = (pFore!.x - pMid!.x) / dForeMid;
        const foreDirY = (pFore!.y - pMid!.y) / dForeMid;
        expect(foreDirX).toBeCloseTo(f.x, 5);
        expect(foreDirY).toBeCloseTo(f.y, 5);

        // 5. Perpendicular distance of Mid gunport from ship center must equal hullHalfWidth
        const dMidToShip = Math.hypot(pMid!.x - ship.x, pMid!.y - ship.y);
        expect(dMidToShip).toBeCloseTo(cfg.hullHalfWidth, 3);
      }
    });

    it('fires exactly 3 starboard projectiles with strictly parallel velocities and correct gunport offsets for all headings', () => {
      const weapons = new WeaponSystem();
      const cfg = DEFAULT_WEAPON_BROADSIDE_RIGHT;

      for (const heading of testHeadings) {
        weapons.reset();
        const ship = createKinematicState(700, 500, heading);
        const projectiles = weapons.fireBroadsideRight(ship, 'player');

        expect(projectiles.length).toBe(3);

        const f = getForwardVector(heading);
        const r = getRightVector(heading);

        const [pFore, pMid, pAft] = projectiles;

        // 1. Parallel velocities
        expect(pFore!.vx).toBeCloseTo(pMid!.vx, 6);
        expect(pFore!.vy).toBeCloseTo(pMid!.vy, 6);
        expect(pMid!.vx).toBeCloseTo(pAft!.vx, 6);
        expect(pMid!.vy).toBeCloseTo(pAft!.vy, 6);

        // 2. Velocity aligns with starboard normal (+r)
        const vSpeed = Math.hypot(pFore!.vx, pFore!.vy);
        expect(vSpeed).toBeCloseTo(cfg.projectileSpeed, 1);
        const normVx = pFore!.vx / vSpeed;
        const normVy = pFore!.vy / vSpeed;
        expect(normVx).toBeCloseTo(r.x, 5);
        expect(normVy).toBeCloseTo(r.y, 5);

        // 3. Gunport spacing: Fore (+18), Mid (0), Aft (-18)
        const dForeMid = Math.hypot(pFore!.x - pMid!.x, pFore!.y - pMid!.y);
        const dMidAft = Math.hypot(pMid!.x - pAft!.x, pMid!.y - pAft!.y);
        expect(dForeMid).toBeCloseTo(cfg.gunportSpacing, 3);
        expect(dMidAft).toBeCloseTo(cfg.gunportSpacing, 3);

        // 4. Direction from Mid to Fore aligns with f
        const foreDirX = (pFore!.x - pMid!.x) / dForeMid;
        const foreDirY = (pFore!.y - pMid!.y) / dForeMid;
        expect(foreDirX).toBeCloseTo(f.x, 5);
        expect(foreDirY).toBeCloseTo(f.y, 5);

        // 5. Perpendicular offset
        const dMidToShip = Math.hypot(pMid!.x - ship.x, pMid!.y - ship.y);
        expect(dMidToShip).toBeCloseTo(cfg.hullHalfWidth, 3);
      }
    });

    it('preserves independent cooldowns under simultaneous and staggered discharges', () => {
      const weapons = new WeaponSystem();
      const ship = createKinematicState(500, 500, 0);

      // Discharging left broadside leaves right broadside and front ready
      weapons.fireBroadsideLeft(ship, 'player');
      expect(weapons.canFire('broadside_left')).toBe(false);
      expect(weapons.canFire('broadside_right')).toBe(true);
      expect(weapons.canFire('front')).toBe(true);

      // Discharging right broadside leaves front ready
      weapons.fireBroadsideRight(ship, 'player');
      expect(weapons.canFire('broadside_right')).toBe(false);
      expect(weapons.canFire('front')).toBe(true);

      // Discharging front cannon leaves broadsides on their existing cooldowns
      weapons.fireFront(ship, 'player');
      expect(weapons.canFire('front')).toBe(false);

      expect(weapons.cooldownFront).toBeCloseTo(0.6, 4);
      expect(weapons.cooldownLeftBroadside).toBeCloseTo(1.8, 4);
      expect(weapons.cooldownRightBroadside).toBeCloseTo(1.8, 4);
    });
  });

  // =========================================================================
  // 3. COLLISION RESOLUTION: Dual-disk capsule vs obstacles & boundaries, sliding, single hit
  // =========================================================================
  describe('3. Collision Resolution, Tangent Sliding & Single-Hit Consumption', () => {
    it('pushes deeply penetrating ship out to clear circular obstacle along surface normal', () => {
      const island = obstacles[0]!; // (600, 350, r=85)
      // Place ship with center 60px from island center (radius 85 + ship disk 16 = 101 minDist)
      // Heading North (0 rad)
      const ship = createKinematicState(island.x + 60, island.y, 0);
      ship.velocityX = -100; // Moving toward island center

      CollisionSystem.resolveShipObstacleCollisions(ship, [island]);

      // Check distance from obstacle center to ship center or capsule disks
      const cap = getShipDualDiskCollider(ship);
      const dBow = Math.hypot(cap.disk1.x - island.x, cap.disk1.y - island.y);
      const dStern = Math.hypot(cap.disk2.x - island.x, cap.disk2.y - island.y);

      expect(dBow).toBeGreaterThanOrEqual(island.radius + cap.disk1.radius - 1e-4);
      expect(dStern).toBeGreaterThanOrEqual(island.radius + cap.disk2.radius - 1e-4);
      expect(ship.velocityX).toBeGreaterThanOrEqual(0); // Inward velocity eliminated
    });

    it('resolves oblique collision with pure tangent sliding without sticking or losing tangent speed', () => {
      const island = obstacles[0]!; // (600, 350, r=85)
      // Position ship on the East flank of the island
      // Normal from island to ship is East: (1, 0)
      // Tangent direction is North: (0, -1)
      const minDistance = island.radius + DEFAULT_SHIP_DISK_RADIUS; // 85 + 16 = 101
      const ship = createKinematicState(island.x + minDistance - 2, island.y, 0);

      // Ship moving North-West: vx = -60 (inward normal), vy = -150 (tangent forward)
      ship.velocityX = -60;
      ship.velocityY = -150;

      CollisionSystem.resolveShipObstacleCollisions(ship, [island]);

      // 1. Inward velocity towards obstacle must be eliminated
      expect(ship.velocityX).toBeCloseTo(0, 3);
      // 2. Tangential velocity along the perimeter must be fully preserved
      expect(ship.velocityY).toBeCloseTo(-150, 3);
      // 3. Position must be corrected out of penetration
      expect(ship.x - island.x).toBeGreaterThanOrEqual(minDistance - 1e-4);
    });

    it('smoothly slides along circular obstacle over 60 continuous steps without corner snagging or penetration', () => {
      const island = obstacles[0]!;
      // Ship heading North, placed on East side of island
      const minDistance = island.radius + DEFAULT_SHIP_DISK_RADIUS;
      const ship = createKinematicState(island.x + minDistance - 1, island.y + 50, 0);
      const dt = 1 / 60;

      for (let step = 0; step < 60; step++) {
        // Ship continuously thrusts forward and steers slightly left into the island
        ShipKinematics.step(
          ship,
          { throttle: 1.0, steer: -0.2 },
          DEFAULT_PLAYER_MOVEMENT,
          dt
        );

        CollisionSystem.resolveShipObstacleCollisions(ship, [island]);

        // Verify that in every single step, ship disks NEVER penetrate the island
        const cap = getShipDualDiskCollider(ship);
        const dBow = Math.hypot(cap.disk1.x - island.x, cap.disk1.y - island.y);
        const dStern = Math.hypot(cap.disk2.x - island.x, cap.disk2.y - island.y);

        expect(dBow).toBeGreaterThanOrEqual(island.radius + DEFAULT_SHIP_DISK_RADIUS - 1e-4);
        expect(dStern).toBeGreaterThanOrEqual(island.radius + DEFAULT_SHIP_DISK_RADIUS - 1e-4);

        // Verify ship does not freeze / stick (it is sliding Northward, negative Y)
        expect(ship.velocityY).toBeLessThan(0);
      }
    });

    it('enforces single-hit consumption: projectile damages only one target and despawns immediately', () => {
      const player: ShipState = {
        id: 'player_ship',
        type: 'player',
        series: 1,
        health: 100,
        maxHealth: 100,
        isDestroyed: false,
        damageTier: 1,
        kinematic: createKinematicState(100, 100, 0),
      };

      // Two overlapping enemies at the exact same location
      const enemy1 = ChaserAI.create(500, 500, 0); // 35 HP
      const enemy2 = ChaserAI.create(500, 500, 0); // 35 HP

      const projectile: Projectile = {
        id: 777,
        owner: 'player',
        weaponType: 'front',
        x: 500,
        y: 500,
        prevX: 500,
        prevY: 510,
        vx: 0,
        vy: -480,
        radius: 4,
        damage: 25,
        remainingLife: 1.0,
        isDead: false,
      };

      const result1 = CollisionSystem.resolveProjectileCollisions(
        [projectile],
        player,
        [enemy1, enemy2],
        []
      );

      // 1. Projectile must be dead
      expect(projectile.isDead).toBe(true);
      expect(result1.despawnedProjectileIds).toContain(777);

      // 2. Exactly one enemy must take damage; the second must remain intact (no penetration)
      expect(enemy1.health).toBe(10); // 35 - 25 = 10
      expect(enemy2.health).toBe(35); // Unharmed!

      // 3. Passing the dead projectile to subsequent collision calls must NEVER damage anyone
      const result2 = CollisionSystem.resolveProjectileCollisions(
        [projectile],
        player,
        [enemy1, enemy2],
        []
      );
      expect(enemy1.health).toBe(10);
      expect(enemy2.health).toBe(35);
      expect(result2.despawnedProjectileIds.length).toBe(0);
    });

    it('immediately consumes projectiles colliding with island obstacles', () => {
      const player: ShipState = {
        id: 'player_ship',
        type: 'player',
        series: 1,
        health: 100,
        maxHealth: 100,
        isDestroyed: false,
        damageTier: 1,
        kinematic: createKinematicState(100, 100, 0),
      };

      const island = obstacles[0]!;
      const projectile: Projectile = {
        id: 888,
        owner: 'player',
        weaponType: 'front',
        x: island.x,
        y: island.y,
        prevX: island.x,
        prevY: island.y + 10,
        vx: 0,
        vy: -480,
        radius: 4,
        damage: 25,
        remainingLife: 1.0,
        isDead: false,
      };

      const result = CollisionSystem.resolveProjectileCollisions(
        [projectile],
        player,
        [],
        [island]
      );

      expect(projectile.isDead).toBe(true);
      expect(result.despawnedProjectileIds).toContain(888);
    });
  });

  // =========================================================================
  // 4. SPAWNER CLEARANCE: 1,000 simulated spawn cycles with PRNG seeds
  // =========================================================================
  describe('4. Spawner Clearance: 1,000 Simulated Spawn Cycles', () => {
    it('verifies 100% of spawns across 1,000 cycles maintain >=380px safe player distance, clear obstacles, and respect 10 enemy cap', () => {
      const spawner = new EnemySpawner({ spawnIntervalSeconds: 0.1, maxActiveEnemies: 10 }, 42);

      // Test across multiple player locations (center, corners, edges, near islands)
      const playerLocations = [
        { x: 800, y: 500 }, // Center
        { x: 100, y: 100 }, // Top-Left
        { x: 1500, y: 900 }, // Bottom-Right
        { x: 600, y: 350 }, // Near Island 1
        { x: 1050, y: 650 }, // Near Island 2
        { x: 350, y: 700 }, // Near Island 3
        { x: 800, y: 100 }, // Top edge
        { x: 800, y: 900 }, // Bottom edge
      ];

      const seeds = [1, 42, 1337, 7777, 99999];
      let totalSpawnAttempts = 0;
      let totalSuccessfulSpawns = 0;
      let cappedRejections = 0;

      const activeEnemies: EnemyShipState[] = [];

      for (const seed of seeds) {
        spawner.setSeed(seed);

        for (let cycle = 0; cycle < 200; cycle++) {
          totalSpawnAttempts++;
          const playerPos = playerLocations[cycle % playerLocations.length]!;
          const playerKinematic = createKinematicState(playerPos.x, playerPos.y, 0);

          spawner.resetCooldown();
          const spawned = spawner.step(1.0, playerKinematic, activeEnemies, obstacles, arena);

          if (activeEnemies.length >= 10) {
            // Must be rejected by entity cap!
            expect(spawned).toBeNull();
            cappedRejections++;
            // Occasionally clear 2 enemies to test re-spawning
            if (cycle % 5 === 0) {
              activeEnemies.splice(0, 2);
            }
            continue;
          }

          if (spawned !== null) {
            totalSuccessfulSpawns++;
            activeEnemies.push(spawned);

            // ORACLE 1: Distance to player must be >= 380px
            const distToPlayer = Math.hypot(
              spawned.kinematic.x - playerKinematic.x,
              spawned.kinematic.y - playerKinematic.y
            );
            expect(distToPlayer).toBeGreaterThanOrEqual(DEFAULT_SPAWNER_CONFIG.safePlayerDistance - 1e-3);

            // ORACLE 2: Obstacle clearance for each island
            for (const obs of obstacles) {
              const distToObs = Math.hypot(
                spawned.kinematic.x - obs.x,
                spawned.kinematic.y - obs.y
              );
              const minAllowedClearance = obs.radius + DEFAULT_SPAWNER_CONFIG.islandClearance;
              expect(distToObs).toBeGreaterThanOrEqual(minAllowedClearance - 1e-3);
            }

            // ORACLE 3: Arena boundary margins [80, W - 80] x [80, H - 80]
            const minMargin = 80;
            expect(spawned.kinematic.x).toBeGreaterThanOrEqual(minMargin);
            expect(spawned.kinematic.x).toBeLessThanOrEqual(arena.width - minMargin);
            expect(spawned.kinematic.y).toBeGreaterThanOrEqual(minMargin);
            expect(spawned.kinematic.y).toBeLessThanOrEqual(arena.height - minMargin);

            // ORACLE 4: Active enemy cap must NEVER exceed 10
            expect(activeEnemies.length).toBeLessThanOrEqual(10);
          }
        }
      }

      expect(totalSpawnAttempts).toBe(1000);
      expect(totalSuccessfulSpawns).toBeGreaterThan(300);
      expect(cappedRejections).toBeGreaterThan(100);
    });

    it('findSafeSpawnPosition returns 100% compliant positions across 1,000 independent trials', () => {
      const spawner = new EnemySpawner({}, 8888);
      const prng = new SeededPRNG(9999);

      for (let trial = 0; trial < 1000; trial++) {
        // Randomize player position across arena
        const playerX = prng.nextRange(100, 1500);
        const playerY = prng.nextRange(100, 900);
        const playerKinematic = createKinematicState(playerX, playerY, 0);

        const pos = spawner.findSafeSpawnPosition(playerKinematic, obstacles, arena);

        expect(pos).not.toBeNull();
        if (pos) {
          // 1. Safe distance from player
          const distToPlayer = Math.hypot(pos.x - playerX, pos.y - playerY);
          expect(distToPlayer).toBeGreaterThanOrEqual(DEFAULT_SPAWNER_CONFIG.safePlayerDistance - 1e-3);

          // 2. Obstacle clearance
          for (const obs of obstacles) {
            const distToObs = Math.hypot(pos.x - obs.x, pos.y - obs.y);
            expect(distToObs).toBeGreaterThanOrEqual(obs.radius + DEFAULT_SPAWNER_CONFIG.islandClearance - 1e-3);
          }

          // 3. Margin compliance
          expect(pos.x).toBeGreaterThanOrEqual(80);
          expect(pos.x).toBeLessThanOrEqual(arena.width - 80);
          expect(pos.y).toBeGreaterThanOrEqual(80);
          expect(pos.y).toBeLessThanOrEqual(arena.height - 80);
        }
      }
    });
  });

  // =========================================================================
  // 5. INTEGRATION SUITE: Full GameSimulation Combat Scenarios
  // =========================================================================
  describe('5. Full Simulation Combat & Match Integrity', () => {
    it('executes 1,000 fixed-timestep simulation ticks with simultaneous movement, firing, and enemies without desync or crash', () => {
      const sim = new GameSimulation({ sessionDurationSeconds: 120 }, 555);

      let totalProjectilesSpawned = 0;
      let totalEnemiesSpawned = 0;

      sim.addListener((evt) => {
        if (evt.type === 'projectile_spawned') totalProjectilesSpawned++;
        if (evt.type === 'enemy_spawned') totalEnemiesSpawned++;
      });

      for (let tick = 0; tick < 1000; tick++) {
        // Intermittently steer and throttle
        const steer = Math.sin(tick * 0.05);
        const throttle = 0.8;
        const fireFront = tick % 40 === 0;
        const fireLeft = tick % 120 === 0;
        const fireRight = tick % 150 === 0;

        sim.setInputs({
          throttle,
          steer,
          fireFront,
          fireBroadsideLeft: fireLeft,
          fireBroadsideRight: fireRight,
        });

        sim.step(1 / 60);

        // Assert player is inside arena
        expect(sim.player.kinematic.x).toBeGreaterThanOrEqual(arena.margin);
        expect(sim.player.kinematic.x).toBeLessThanOrEqual(arena.width - arena.margin);
        expect(sim.player.kinematic.y).toBeGreaterThanOrEqual(arena.margin);
        expect(sim.player.kinematic.y).toBeLessThanOrEqual(arena.height - arena.margin);

        // Active enemies cap
        expect(sim.enemies.length).toBeLessThanOrEqual(10);
      }

      expect(totalProjectilesSpawned).toBeGreaterThan(0);
      expect(totalEnemiesSpawned).toBeGreaterThan(0);
      expect(sim.tickCount).toBe(1000);
      expect(sim.elapsedSeconds).toBeCloseTo(1000 / 60, 4);
    });

    it('freezes completely on pause: timer, cooldowns, spawner, and rejects input buffering', () => {
      const sim = new GameSimulation({ sessionDurationSeconds: 90 }, 123);
      sim.step(1 / 60);

      const beforeTime = sim.remainingSeconds;
      const beforeTick = sim.tickCount;
      const beforeX = sim.player.kinematic.x;

      // Pause match
      sim.pause();
      expect(sim.isPaused).toBe(true);

      // Attempt inputs while paused
      sim.setInputs({ throttle: 1.0, steer: 1.0, fireFront: true });

      // Step while paused
      sim.step(1 / 60);

      expect(sim.remainingSeconds).toBe(beforeTime);
      expect(sim.tickCount).toBe(beforeTick);
      expect(sim.player.kinematic.x).toBe(beforeX);
      expect(sim.projectiles.length).toBe(0);

      // Resume
      sim.resume();
      expect(sim.isPaused).toBe(false);

      // Verify input buffer was wiped (zero throttle/steer/fire)
      sim.step(1 / 60);
      expect(sim.projectiles.length).toBe(0); // Did not fire from buffered inputs
    });
  });
});
