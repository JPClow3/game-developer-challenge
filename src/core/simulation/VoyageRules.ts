import { DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from '../../types/config';
import type { IslandObstacle } from '../../types/game';

export const DIFFICULTIES = ['calm', 'open', 'storm'] as const;
export type DifficultyId = typeof DIFFICULTIES[number];
export const MAPS = ['archipelago', 'straits', 'fortress'] as const;
export type MapId = typeof MAPS[number];
export interface VoyageRules { difficulty: DifficultyId; map: MapId }

export const DIFFICULTY_DETAILS = {
  calm: { name: 'Calm waters', description: 'Gentler crews. More repair salvage.', damage: .6, speed: .85, health: .8, cap: 6 },
  open: { name: 'Open sea', description: 'A steady opening. A fierce finish.', damage: .85, speed: .95, health: 1, cap: 10 },
  storm: { name: 'Storm fleet', description: 'Tougher hulls and relentless broadsides.', damage: 1.15, speed: 1.1, health: 1.2, cap: 12 },
} as const;
export const MAP_DETAILS = {
  archipelago: { name: 'Smuggler islands', description: 'Open routes around three inhabited islands.' },
  straits: { name: 'Broken straits', description: 'Two channels. Bring enemies into your broadside.' },
  fortress: { name: 'Fortress bay', description: 'A sheltered harbour with a dangerous outer ring.' },
} as const;

export function isVoyageRules(value: unknown): value is VoyageRules {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as VoyageRules;
  return DIFFICULTIES.includes(candidate.difficulty) && MAPS.includes(candidate.map) &&
    Object.keys(candidate).every(key => key === 'difficulty' || key === 'map');
}

/** Canonical balance. A preset never multiplies an already modified match. */
export function voyageGameplayConfig(duration: number, interval: number, voyage: VoyageRules): GameplayConfig {
  const base = DEFAULT_GAMEPLAY_CONFIG, preset = DIFFICULTY_DETAILS[voyage.difficulty];
  return {
    ...structuredClone(base), sessionDurationSeconds: duration, voyage: { ...voyage },
    spawner: { ...base.spawner, spawnIntervalSeconds: interval, maxActiveEnemies: preset.cap },
    chaser: { ...base.chaser, maxHealth: Math.round(base.chaser.maxHealth * preset.health),
      rammingDamage: Math.round(base.chaser.rammingDamage * preset.damage),
      movement: { ...base.chaser.movement, maxForwardSpeed: base.chaser.movement.maxForwardSpeed * preset.speed } },
    shooter: { ...base.shooter, maxHealth: Math.round(base.shooter.maxHealth * preset.health),
      movement: { ...base.shooter.movement, maxForwardSpeed: base.shooter.movement.maxForwardSpeed * preset.speed },
      cannon: { ...base.shooter.cannon, projectileDamage: Math.round(base.shooter.cannon.projectileDamage * preset.damage),
        cooldownSeconds: base.shooter.cannon.cooldownSeconds / preset.speed } },
  };
}

function island(id: string, x: number, y: number, radius: number): IslandObstacle {
  return { id, x, y, radius, tileIds: [] };
}

/** Overlapping disks define both the drawn shoreline and physical land. */
export function voyageObstacles(map: MapId): IslandObstacle[] {
  const clusters: Record<MapId, number[][]> = {
    archipelago: [[550,330,90],[620,345,75],[1090,620,95],[1025,680,70],[350,705,65],[390,730,42]],
    straits: [[480,250,90],[510,360,80],[535,475,70],[1020,500,80],[1050,615,85],[1090,730,80],[790,180,48]],
    fortress: [[720,390,100],[830,390,95],[655,475,75],[890,480,75],[500,710,65],[1100,710,65]],
  };
  return clusters[map].map(([x,y,radius], index) => island(`${map}_${index}`, x!, y!, radius!));
}

export function voyagePressure(elapsed: number, duration: number, cap: number) {
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  return { cap: Math.max(3, Math.round(3 + (cap - 3) * progress)), intervalScale: 1.35 - .6 * progress,
    shooterShare: .25 + .35 * progress };
}
