import type { GameSimulation, PlayerInputState } from './GameSimulation';
import { ShipKinematics } from '../kinematics/ShipKinematics';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { ChaserAI, computeDamageTier } from '../ai/ChaserAI';
import { ShooterAI } from '../ai/ShooterAI';
import { CollisionSystem } from '../collision/CollisionSystem';
import type { ChaserEnemyState, ShooterEnemyState } from '../../types';
import { voyagePressure } from './VoyageRules';

/** One combat tick. Ordering is part of the deterministic replay contract. */
export function stepCombat(sim: GameSimulation, dt: number, input: PlayerInputState): void {
  sim.tickCount++;
  sim.elapsedSeconds += dt;

  // 1. Session duration countdown
  if (sim.mode !== 'training') sim.remainingSeconds -= dt;
  if (sim.remainingSeconds <= 0) {
    sim.remainingSeconds = 0;
    sim.endMatch('time_expired');
    return;
  }

  // 2. Decrement weapon cooldowns
  sim.weaponSystem.stepCooldowns(dt);
  sim.player.cooldownFront = sim.weaponSystem.cooldownFront;
  sim.player.cooldownLeftBroadside = sim.weaponSystem.cooldownLeftBroadside;
  sim.player.cooldownRightBroadside = sim.weaponSystem.cooldownRightBroadside;

  // 3. Process player movement kinematics
  ShipKinematics.step(
    sim.player.kinematic,
    {
      throttle: input.throttle,
      steer: input.steer,
    },
    sim.config.playerMovement,
    dt,
    sim.config.arena,
  );

  // 4. Simultaneous player weapon discharges
  const shouldFireFront =
    input.fireFront && (sim.mode !== 'training' || sim.trainingStage === 'front');
  if (shouldFireFront && sim.weaponSystem.canFire('front')) {
    const spawned = sim.weaponSystem.fireFront(sim.player.kinematic, 'player');
    for (const p of spawned) p.id = ++sim.entityCounters.projectile;
    sim.projectiles.push(...spawned);
    sim.stats.shotsFired += spawned.length;
    for (const p of spawned) sim.emit('projectile_spawned', p);
  }

  const shouldFireLeft =
    input.fireBroadsideLeft && (sim.mode !== 'training' || sim.trainingStage === 'broadside');
  if (shouldFireLeft && sim.weaponSystem.canFire('broadside_left')) {
    const spawned = sim.weaponSystem.fireBroadsideLeft(sim.player.kinematic, 'player');
    sim.emit('broadside_fired', { side: -1, rotation: sim.player.kinematic.rotation });
    for (const p of spawned) p.id = ++sim.entityCounters.projectile;
    sim.projectiles.push(...spawned);
    sim.stats.shotsFired += spawned.length;
    for (const p of spawned) sim.emit('projectile_spawned', p);
  }

  const shouldFireRight =
    input.fireBroadsideRight && (sim.mode !== 'training' || sim.trainingStage === 'broadside');
  if (shouldFireRight && sim.weaponSystem.canFire('broadside_right')) {
    const spawned = sim.weaponSystem.fireBroadsideRight(sim.player.kinematic, 'player');
    sim.emit('broadside_fired', { side: 1, rotation: sim.player.kinematic.rotation });
    for (const p of spawned) p.id = ++sim.entityCounters.projectile;
    sim.projectiles.push(...spawned);
    sim.stats.shotsFired += spawned.length;
    for (const p of spawned) sim.emit('projectile_spawned', p);
  }

  // 5. Update enemy AI subsystems
  for (const enemy of sim.enemies) {
    if (enemy.isDestroyed || sim.mode === 'training') continue;

    const aim = sim.player.kinematic;
    const waypoint = sim.config.voyage ? sim.navigation.waypoint(enemy.kinematic, aim) : undefined;

    if (enemy.type === 'chaser') {
      ChaserAI.update(enemy as ChaserEnemyState, aim, sim.obstacles, dt, sim.config.arena, sim.config.chaser, waypoint);
    } else if (enemy.type === 'shooter') {
      const shot = ShooterAI.update(
        enemy as ShooterEnemyState,
        aim,
        sim.obstacles,
        dt,
        sim.config.arena,
        sim.config.shooter,
        waypoint,
      );
      if (shot) {
        shot.id = ++sim.entityCounters.projectile;
        sim.projectiles.push(shot);
        sim.emit('projectile_spawned', shot);
      }
    }
  }

  // 6. Enemy Spawner tick
  const newEnemy =
    sim.mode === 'training'
      ? null
      : sim.spawner.step(dt, sim.player.kinematic, sim.enemies, sim.obstacles, sim.config.arena,
        sim.config.voyage ? voyagePressure(sim.elapsedSeconds,sim.durationSeconds,sim.config.spawner.maxActiveEnemies) : undefined);
  if (newEnemy) {
    newEnemy.id = `${newEnemy.type}_${++sim.entityCounters.enemy}`;
    if (sim.config.voyage) newEnemy.health = newEnemy.maxHealth = newEnemy.type==='chaser' ? sim.config.chaser.maxHealth : sim.config.shooter.maxHealth;
    sim.enemies.push(newEnemy);
    sim.emit('enemy_spawned', newEnemy);
  }

  // 7. Projectile kinematics update
  const movingProjectiles = sim.projectiles;
  sim.projectiles = WeaponSystem.stepProjectiles(sim.projectiles, dt, sim.config.arena);
  for (const shot of movingProjectiles)
    if (shot.isDead) sim.emit('shot_splash', { x: shot.x, y: shot.y });

  // 8. Collision detection & resolution
  // A. Island Obstacle Collisions (Tangent sliding)
  CollisionSystem.resolveShipObstacleCollisions(sim.player.kinematic, sim.obstacles);
  for (const enemy of sim.enemies) {
    if (!enemy.isDestroyed) {
      CollisionSystem.resolveShipObstacleCollisions(enemy.kinematic, sim.obstacles);
    }
  }

  // B. Arena Boundary Collisions (Tangent sliding)
  CollisionSystem.resolveShipArenaCollisions(sim.player.kinematic, sim.config.arena);
  for (const enemy of sim.enemies) {
    if (!enemy.isDestroyed) {
      CollisionSystem.resolveShipArenaCollisions(enemy.kinematic, sim.config.arena);
    }
  }

  // C. Ship-to-Ship Ramming & Separation
  let healthBefore = sim.player.health;
  const shipShipResult = CollisionSystem.resolveShipShipCollisions(sim.player, sim.enemies, sim.config.chaser.rammingDamage);
  sim.stats.damageTaken += Math.max(0,healthBefore-sim.player.health);

  if (shipShipResult.playerDamaged) {
    for (const id of shipShipResult.chaserSuicideRams)
      sim.emit(
        'ship_sunk',
        sim.enemies.find((enemy) => enemy.id === id),
      );
    sim.player.damageTier = computeDamageTier(sim.player.health, sim.player.maxHealth);
    sim.emit('health_changed', {
      current: sim.player.health,
      max: sim.player.maxHealth,
      percentage: (sim.player.health / sim.player.maxHealth) * 100,
    });
    if (sim.player.health <= 0) {
      sim.player.isDestroyed = true;
      sim.endMatch('player_destroyed');
      return;
    }
  }

  // D. Projectile Collisions (Single-hit guarantee)
  healthBefore = sim.player.health;
  const projResult = CollisionSystem.resolveProjectileCollisions(
    sim.projectiles,
    sim.player,
    sim.enemies,
    sim.obstacles,
  );
  sim.stats.damageTaken += Math.max(0,healthBefore-sim.player.health);
  sim.stats.hits += projResult.playerProjectileHits ?? 0;
  for (const splash of projResult.splashes ?? []) sim.emit('shot_splash', splash);
  for (const id of projResult.enemiesDestroyed) {
    const enemy=sim.enemies.find(e=>e.id===id);
    if (enemy && sim.mode !== 'training') {
      if(enemy.type==='chaser')sim.stats.chasersSunk++;else sim.stats.shootersSunk++;
      sim.salvage.drop(sim,enemy.kinematic);
    }
    sim.emit(
      'ship_sunk',
      sim.enemies.find((enemy) => enemy.id === id),
    );
  }
  if (projResult.scoreAwarded > 0 && sim.mode !== 'training') {
    sim.score += projResult.scoreAwarded;
    sim.emit('score_changed', { score: sim.score });
  }

  if (projResult.playerDamaged) {
    sim.player.damageTier = computeDamageTier(sim.player.health, sim.player.maxHealth);
    sim.emit('health_changed', {
      current: sim.player.health,
      max: sim.player.maxHealth,
      percentage: (sim.player.health / sim.player.maxHealth) * 100,
    });
    if (sim.player.health <= 0) {
      sim.player.isDestroyed = true;
      sim.endMatch('player_destroyed');
      return;
    }
  }

  // 9. Prune destroyed enemies & dead projectiles
  if(sim.mode !== 'training' && sim.config.voyage)sim.salvage.step(sim,dt);
  if (sim.mode !== 'training') sim.enemies = sim.enemies.filter((e) => !e.isDestroyed);
  sim.projectiles = sim.projectiles.filter((p) => !p.isDead);
  // 10. Update player damage tier
  sim.player.damageTier = computeDamageTier(sim.player.health, sim.player.maxHealth);
}
