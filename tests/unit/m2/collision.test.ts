import { describe, it, expect } from 'vitest';
import {
  CollisionSystem,
  getShipDualDiskCollider,
  checkCapsuleCapsuleOverlap,
  checkProjectileCapsuleOverlap,
  DEFAULT_SHIP_DISK_OFFSET,
  DEFAULT_SHIP_DISK_RADIUS,
} from '../../../src/core/collision/CollisionSystem';
import { createKinematicState } from '../../../src/core/kinematics/ShipKinematics';
import { ChaserAI } from '../../../src/core/ai/ChaserAI';
import type { ShipState, Projectile, IslandObstacle, ArenaBounds } from '../../../src/types';

describe('CollisionSystem Subsystem', () => {
  const arena: ArenaBounds = { width: 1600, height: 1000, margin: 40 };

  it.each([0, .37, Math.PI / 2, 2.2].flatMap(rotation =>
    [-1e-6, 0, 1e-6].map(side => ({rotation, side}))))(
    'separates an island centered on the hull segment at heading $rotation, offset $side', ({rotation, side}) => {
      const obstacle: IslandObstacle = {id:'centered',x:600,y:350,radius:85,tileIds:[]};
      const forward = {x:Math.sin(rotation),y:-Math.cos(rotation)};
      const normal = {x:-forward.y,y:forward.x};
      const direction = side < 0 ? -1 : 1;
      const ship = createKinematicState(obstacle.x + forward.x * 6 + normal.x * side,
        obstacle.y + forward.y * 6 + normal.y * side, rotation);
      ship.velocityX = forward.x * 100 - normal.x * direction * 25;
      ship.velocityY = forward.y * 100 - normal.y * direction * 25;
      CollisionSystem.resolveShipObstacleCollisions(ship,[obstacle]);
      const capsule = getShipDualDiskCollider(ship);
      const dx = capsule.disk2.x-capsule.disk1.x, dy = capsule.disk2.y-capsule.disk1.y;
      const t = Math.max(0,Math.min(1,((obstacle.x-capsule.disk1.x)*dx+(obstacle.y-capsule.disk1.y)*dy)/(dx*dx+dy*dy)));
      const separation = Math.hypot(capsule.disk1.x+dx*t-obstacle.x,capsule.disk1.y+dy*t-obstacle.y);
      expect(separation).toBeGreaterThanOrEqual(obstacle.radius+DEFAULT_SHIP_DISK_RADIUS-1e-8);
      expect(ship.velocityX*normal.x*direction+ship.velocityY*normal.y*direction).toBeCloseTo(0,8);
      expect(ship.velocityX*forward.x+ship.velocityY*forward.y).toBeCloseTo(100,8);
      const resolved = {x:ship.x,y:ship.y};
      CollisionSystem.resolveShipObstacleCollisions(ship,[obstacle]);
      expect(ship.x).toBeCloseTo(resolved.x,8);expect(ship.y).toBeCloseTo(resolved.y,8);
    });

  it('computes dual-disk capsule collider with bow and stern disks (R=16px, offset 15px)', () => {
    // Ship facing North (0 rad) at (500, 500)
    const ship = createKinematicState(500, 500, 0);
    const capsule = getShipDualDiskCollider(ship);

    expect(capsule.disk1.radius).toBe(DEFAULT_SHIP_DISK_RADIUS); // 16px
    expect(capsule.disk2.radius).toBe(DEFAULT_SHIP_DISK_RADIUS); // 16px

    // Heading North (0, -1): Bow is +15 along forward (North, -Y), Stern is -15 (South, +Y)
    expect(capsule.disk1.x).toBeCloseTo(500, 4);
    expect(capsule.disk1.y).toBeCloseTo(500 - DEFAULT_SHIP_DISK_OFFSET, 4);
    expect(capsule.disk2.x).toBeCloseTo(500, 4);
    expect(capsule.disk2.y).toBeCloseTo(500 + DEFAULT_SHIP_DISK_OFFSET, 4);
  });

  it('detects overlap between two dual-disk capsule colliders', () => {
    const shipA = createKinematicState(500, 500, 0);
    const shipB = createKinematicState(500, 520, 0); // Overlapping
    const shipC = createKinematicState(500, 800, 0); // Far away

    const capA = getShipDualDiskCollider(shipA);
    const capB = getShipDualDiskCollider(shipB);
    const capC = getShipDualDiskCollider(shipC);

    expect(checkCapsuleCapsuleOverlap(capA, capB)).toBe(true);
    expect(checkCapsuleCapsuleOverlap(capA, capC)).toBe(false);
  });

  it('detects overlap between point projectile and dual-disk capsule', () => {
    const ship = createKinematicState(500, 500, 0);
    const cap = getShipDualDiskCollider(ship);

    const hitProj: Projectile = {
      id: 1,
      owner: 'enemy',
      weaponType: 'front',
      x: 500,
      y: 490, // Near bow
      prevX: 500,
      prevY: 490,
      vx: 0,
      vy: 100,
      radius: 4,
      damage: 15,
      remainingLife: 1.0,
      isDead: false,
    };

    const missProj: Projectile = {
      ...hitProj,
      id: 2,
      x: 600,
      y: 600,
    };

    expect(checkProjectileCapsuleOverlap(hitProj, cap)).toBe(true);
    expect(checkProjectileCapsuleOverlap(missProj, cap)).toBe(false);
  });

  it('resolves ship-island collision via tangent sliding (preserves tangential speed, clears normal velocity)', () => {
    const obstacles: IslandObstacle[] = [
      { id: 'island_1', x: 500, y: 485, radius: 60, tileIds: [] },
    ];

    // Ship heading North at (440, 500): Bow disk is at (440, 485)
    // Obstacle is at (500, 485), radius 60. Bow disk radius 16.
    // Center-to-center distance = 60 < 76 (penetration depth 16px).
    // dx = 440 - 500 = -60, dy = 485 - 485 = 0. Normal is purely (-1, 0).
    // Ship moving diagonally Northeast (vx = 50 towards island, vy = -100 tangent along island)
    const ship = createKinematicState(440, 500, 0);
    ship.velocityX = 50;   // Moving towards island
    ship.velocityY = -100; // Moving tangent to island (North)

    CollisionSystem.resolveShipObstacleCollisions(ship, obstacles);

    // Ship position should be pushed out away from island center (x <= 440 - penetration)
    expect(ship.x).toBeLessThanOrEqual(440);
    // Inward normal velocity (velocityX > 0) should be eliminated
    expect(ship.velocityX).toBeLessThanOrEqual(0);
    // Tangential forward velocity (velocityY = -100) along island tangent is fully preserved!
    expect(ship.velocityY).toBeCloseTo(-100, 1);
  });

  it('resolves ship-arena border collisions with tangent sliding', () => {
    const ship = createKinematicState(arena.margin - 10, 500, 0);
    ship.velocityX = -80; // Trying to move through left boundary
    ship.velocityY = -120; // Moving north

    CollisionSystem.resolveShipArenaCollisions(ship, arena);

    expect(ship.x).toBe(arena.margin);
    expect(ship.velocityX).toBeGreaterThanOrEqual(0); // Clamped
    expect(ship.velocityY).toBe(-120); // Tangent sliding intact
  });

  it('triggers suicide ramming on Chaser-Player collision (35 damage, strictly 0 score awarded)', () => {
    const player: ShipState = {
      id: 'player_ship',
      type: 'player',
      series: 1,
      health: 100,
      maxHealth: 100,
      isDestroyed: false,
      damageTier: 1,
      kinematic: createKinematicState(500, 500, 0),
    };

    const chaser = ChaserAI.create(500, 510, 0); // Touching player
    const result = CollisionSystem.resolveShipShipCollisions(player, [chaser]);

    expect(result.playerDamaged).toBe(true);
    expect(result.chaserSuicideRams).toContain(chaser.id);
    expect(player.health).toBe(65); // 100 - 35
    expect(chaser.health).toBe(0);
    expect(chaser.isDestroyed).toBe(true);
    // Crucial rule: Chaser ramming gives 0 score to player!
  });

  it('enforces single-hit projectile consumption (inflicts damage once, despawns, awards 1 point on kill)', () => {
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

    const chaser = ChaserAI.create(500, 500, 0); // 35 HP
    const projectile: Projectile = {
      id: 99,
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

    // First collision resolution
    const res1 = CollisionSystem.resolveProjectileCollisions([projectile], player, [chaser], []);
    expect(projectile.isDead).toBe(true);
    expect(chaser.health).toBe(10); // 35 - 25
    expect(res1.scoreAwarded).toBe(0); // Not killed yet
    expect(res1.despawnedProjectileIds).toContain(99);

    // Second tick with the same dead projectile: MUST NOT damage again!
    const res2 = CollisionSystem.resolveProjectileCollisions([projectile], player, [chaser], []);
    expect(chaser.health).toBe(10); // Unchanged! Single-hit guarantee
    expect(res2.scoreAwarded).toBe(0);

    // Now fire a killing projectile (25 damage against 10 HP)
    const killProjectile: Projectile = {
      ...projectile,
      id: 100,
      isDead: false,
    };
    const res3 = CollisionSystem.resolveProjectileCollisions([killProjectile], player, [chaser], []);
    expect(chaser.health).toBe(0);
    expect(chaser.isDestroyed).toBe(true);
    expect(res3.enemiesDestroyed).toContain(chaser.id);
    expect(res3.scoreAwarded).toBe(1); // Exactly +1 score on player projectile kill!
  });

  it('despawns projectiles immediately on island obstacle impact', () => {
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

    const obstacles: IslandObstacle[] = [
      { id: 'island_1', x: 400, y: 400, radius: 50, tileIds: [] },
    ];

    const proj: Projectile = {
      id: 200,
      owner: 'player',
      weaponType: 'front',
      x: 410,
      y: 410, // Inside island
      prevX: 410,
      prevY: 420,
      vx: 0,
      vy: -400,
      radius: 4,
      damage: 25,
      remainingLife: 1.0,
      isDead: false,
    };

    const res = CollisionSystem.resolveProjectileCollisions([proj], player, [], obstacles);
    expect(proj.isDead).toBe(true);
    expect(res.despawnedProjectileIds).toContain(200);
  });
});
