/**
 * Gameplay Configuration Contracts, Constants & Validation
 */

import { isVoyageRules } from '../core/simulation/VoyageRules';

export interface ShipMovementConfig {
  readonly maxForwardSpeed: number;   // px/s
  readonly acceleration: number;      // px/s²
  readonly turnRate: number;          // rad/s
  readonly longitudinalDrag: number;  // s⁻¹
  readonly lateralDrag: number;       // s⁻¹
  readonly reverseAllowed: boolean;
}

export interface WeaponConfig {
  readonly cooldownSeconds: number;
  readonly projectileDamage: number;
  readonly projectileSpeed: number;    // px/s
  readonly projectileLifetime: number; // seconds
  readonly projectileRadius: number;   // px
}

export interface BroadsideWeaponConfig extends WeaponConfig {
  readonly projectileCount: number;    // exactly 3
  readonly gunportSpacing: number;     // px along hull
  readonly hullHalfWidth: number;      // lateral offset px
}

export interface ChaserAIConfig {
  readonly maxHealth: number;
  readonly movement: ShipMovementConfig;
  readonly rammingDamage: number;
  readonly contactRadius: number;      // detonation trigger px
  readonly scoreAwardedOnKill: number; // 1 point for player projectile kill, 0 for ramming
}

export interface ShooterAIConfig {
  readonly maxHealth: number;
  readonly movement: ShipMovementConfig;
  readonly engageMinDistance: number;  // 240 px
  readonly engageMaxDistance: number;  // 360 px
  readonly aimToleranceRadians: number;// ~12 deg (0.21 rad)
  readonly cannon: WeaponConfig;
  readonly scoreAwardedOnKill: number; // 1 point
}

export interface ArenaConfig {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
}

export interface SpawnerConfig {
  readonly spawnIntervalSeconds: number; // 1s - 15s (default 3s or 5s)
  readonly safePlayerDistance: number;   // >= 380 px
  readonly islandClearance: number;       // clearance px
  readonly maxActiveEnemies: number;      // density cap (default 10)
  readonly chaserWeight: number;          // probability weight
  readonly shooterWeight: number;
}

export interface GameplayConfig {
  readonly voyage?: import('../core/simulation/VoyageRules').VoyageRules;
  readonly sessionDurationSeconds: number; // 60 - 180s
  readonly playerMaxHealth: number;
  readonly playerMovement: ShipMovementConfig;
  readonly weaponFront: WeaponConfig;
  readonly weaponBroadsideLeft: BroadsideWeaponConfig;
  readonly weaponBroadsideRight: BroadsideWeaponConfig;
  readonly chaser: ChaserAIConfig;
  readonly shooter: ShooterAIConfig;
  readonly arena: ArenaConfig;
  readonly spawner: SpawnerConfig;
}

export const MIN_SESSION_DURATION = 60;
export const MAX_SESSION_DURATION = 180;
export const MIN_SPAWN_INTERVAL = 1;
export const MAX_SPAWN_INTERVAL = 15;

export const DEFAULT_PLAYER_MOVEMENT: ShipMovementConfig = {
  maxForwardSpeed: 220,
  acceleration: 180,
  turnRate: 2.6,
  longitudinalDrag: 0.95,
  lateralDrag: 5.5,
  reverseAllowed: false,
};

export const DEFAULT_WEAPON_FRONT: WeaponConfig = {
  cooldownSeconds: 0.60,
  projectileDamage: 25,
  projectileSpeed: 480,
  projectileLifetime: 1.2,
  projectileRadius: 4,
};

export const DEFAULT_WEAPON_BROADSIDE_LEFT: BroadsideWeaponConfig = {
  cooldownSeconds: 1.80,
  projectileDamage: 20,
  projectileSpeed: 420,
  projectileLifetime: 1.1,
  projectileRadius: 4,
  projectileCount: 3,
  gunportSpacing: 18,
  hullHalfWidth: 16,
};

export const DEFAULT_WEAPON_BROADSIDE_RIGHT: BroadsideWeaponConfig = {
  ...DEFAULT_WEAPON_BROADSIDE_LEFT,
};

export const DEFAULT_CHASER_CONFIG: ChaserAIConfig = {
  maxHealth: 35,
  movement: {
    maxForwardSpeed: 165,
    acceleration: 150,
    turnRate: 2.4,
    longitudinalDrag: 0.8,
    lateralDrag: 5.0,
    reverseAllowed: false,
  },
  rammingDamage: 35,
  contactRadius: 36,
  scoreAwardedOnKill: 1,
};

export const DEFAULT_SHOOTER_CONFIG: ShooterAIConfig = {
  maxHealth: 60,
  movement: {
    maxForwardSpeed: 130,
    acceleration: 110,
    turnRate: 1.8,
    longitudinalDrag: 0.9,
    lateralDrag: 5.0,
    reverseAllowed: true,
  },
  engageMinDistance: 240,
  engageMaxDistance: 360,
  aimToleranceRadians: 0.21,
  cannon: {
    cooldownSeconds: 2.0,
    projectileDamage: 15,
    projectileSpeed: 380,
    projectileLifetime: 1.2,
    projectileRadius: 4,
  },
  scoreAwardedOnKill: 1,
};

export const DEFAULT_ARENA_CONFIG: ArenaConfig = {
  width: 1600,
  height: 1000,
  margin: 40,
};

export const DEFAULT_SPAWNER_CONFIG: SpawnerConfig = {
  spawnIntervalSeconds: 3.0,
  safePlayerDistance: 380,
  islandClearance: 40,
  maxActiveEnemies: 10,
  chaserWeight: 0.5,
  shooterWeight: 0.5,
};

export const DEFAULT_GAMEPLAY_CONFIG: GameplayConfig = {
  sessionDurationSeconds: 120,
  playerMaxHealth: 100,
  playerMovement: DEFAULT_PLAYER_MOVEMENT,
  weaponFront: DEFAULT_WEAPON_FRONT,
  weaponBroadsideLeft: DEFAULT_WEAPON_BROADSIDE_LEFT,
  weaponBroadsideRight: DEFAULT_WEAPON_BROADSIDE_RIGHT,
  chaser: DEFAULT_CHASER_CONFIG,
  shooter: DEFAULT_SHOOTER_CONFIG,
  arena: DEFAULT_ARENA_CONFIG,
  spawner: DEFAULT_SPAWNER_CONFIG,
};

/**
 * Validation & Clamping utilities
 */
export function clampSessionDuration(seconds: number): number {
  if (isNaN(seconds) || !isFinite(seconds)) return DEFAULT_GAMEPLAY_CONFIG.sessionDurationSeconds;
  return Math.max(MIN_SESSION_DURATION, Math.min(MAX_SESSION_DURATION, Math.round(seconds)));
}

export function clampSpawnInterval(seconds: number): number {
  if (isNaN(seconds) || !isFinite(seconds)) return DEFAULT_GAMEPLAY_CONFIG.spawner.spawnIntervalSeconds;
  return Math.max(MIN_SPAWN_INTERVAL, Math.min(MAX_SPAWN_INTERVAL, Math.round(seconds * 10) / 10));
}

export interface ValidationResult<T> {
  isValid: boolean;
  errors: string[];
  validatedConfig: T;
}

export function validateGameplayConfig(partial?: Partial<GameplayConfig>): ValidationResult<GameplayConfig> {
  const errors: string[] = [];
  if (partial?.voyage !== undefined && !isVoyageRules(partial.voyage)) errors.push('Invalid voyage difficulty or map.');

  const sessionDuration = partial?.sessionDurationSeconds !== undefined
    ? partial.sessionDurationSeconds
    : DEFAULT_GAMEPLAY_CONFIG.sessionDurationSeconds;

  if (
    typeof sessionDuration !== 'number' ||
    !Number.isFinite(sessionDuration) ||
    sessionDuration < MIN_SESSION_DURATION ||
    sessionDuration > MAX_SESSION_DURATION
  ) {
    errors.push(
      `sessionDurationSeconds must be between ${MIN_SESSION_DURATION} and ${MAX_SESSION_DURATION} seconds (received ${sessionDuration}).`
    );
  }

  const spawnInterval = partial?.spawner?.spawnIntervalSeconds !== undefined
    ? partial.spawner.spawnIntervalSeconds
    : DEFAULT_GAMEPLAY_CONFIG.spawner.spawnIntervalSeconds;

  if (
    typeof spawnInterval !== 'number' ||
    !Number.isFinite(spawnInterval) ||
    spawnInterval < MIN_SPAWN_INTERVAL ||
    spawnInterval > MAX_SPAWN_INTERVAL
  ) {
    errors.push(
      `spawner.spawnIntervalSeconds must be between ${MIN_SPAWN_INTERVAL} and ${MAX_SPAWN_INTERVAL} seconds (received ${spawnInterval}).`
    );
  }

  const validatedConfig: GameplayConfig = {
    ...DEFAULT_GAMEPLAY_CONFIG,
    ...partial,
    sessionDurationSeconds: clampSessionDuration(sessionDuration),
    spawner: {
      ...DEFAULT_SPAWNER_CONFIG,
      ...(partial?.spawner || {}),
      spawnIntervalSeconds: clampSpawnInterval(spawnInterval),
    },
  };

  return {
    isValid: errors.length === 0,
    errors,
    validatedConfig,
  };
}

const CONFIG_STORAGE_KEY = 'pirate_battle_user_config_v1';

export function saveUserConfigToStorage(config: GameplayConfig): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save config to localStorage', e);
  }
}

export function loadUserConfigFromStorage(): GameplayConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const res = validateGameplayConfig(parsed);
    if (!res.isValid) return null;
    // Stored menu options must match the whole-second score/database contract.
    // Keep the simulation validator unchanged so older fractional replays work.
    return {
      ...res.validatedConfig,
      spawner: {
        ...res.validatedConfig.spawner,
        spawnIntervalSeconds: Math.round(res.validatedConfig.spawner.spawnIntervalSeconds),
      },
    };
  } catch {
    return null;
  }
}
