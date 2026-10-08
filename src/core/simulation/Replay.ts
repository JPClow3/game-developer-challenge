import type { GameplayConfig } from '../../types';
import type { GameSimulation, PlayerInputState } from './GameSimulation';

// Bump whenever tick ordering, physics, AI, or default obstacles change.
export const SIMULATION_VERSION = 'pirate-battle-2';
export interface BattleReplay {
  version: typeof SIMULATION_VERSION;
  seed: number;
  config: GameplayConfig;
  inputs: { tick: number; input: PlayerInputState }[];
  checks: { tick: number; hash: string }[];
  endTick: number;
}

/** Checks include hidden future state (RNG, cooldowns, IDs), not just positions. */
export function stateHash(sim: GameSimulation): string {
  const state = JSON.stringify({
    tick: sim.tickCount,
    time: sim.remainingSeconds,
    score: sim.score,
    ended: sim.isEnded,
    reason: sim.endReason,
    player: sim.player,
    enemies: sim.enemies,
    projectiles: sim.projectiles,
    spawner: sim.spawner,
    weapons: sim.weaponSystem,
    counters: sim.entityCounters,
    obstacles: sim.obstacles,
  });
  let hash = 2166136261;
  for (let i = 0; i < state.length; i++) hash = Math.imul(hash ^ state.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function validateReplay(replay: BattleReplay): void {
  if (
    !replay ||
    typeof replay !== 'object' ||
    !Array.isArray(replay.inputs) ||
    !Array.isArray(replay.checks) ||
    replay.inputs.length > 10801 ||
    replay.checks.length > 10801 ||
    !replay.config ||
    typeof replay.config !== 'object'
  )
    throw new Error('Invalid replay structure.');
  if (replay.version !== SIMULATION_VERSION)
    throw new Error('This replay uses an incompatible simulation version.');
  if ('raid' in replay || 'upgrades' in replay) throw new Error('Invalid replay ruleset.');
  if (
    !Number.isSafeInteger(replay.seed) ||
    !Number.isInteger(replay.endTick) ||
    replay.endTick < 1 ||
    replay.endTick > 10801
  )
    throw new Error('Invalid replay duration or seed.');
  let last = 0;
  for (const entry of replay.inputs) {
    if (!entry || !entry.input || typeof entry.input !== 'object')
      throw new Error('Invalid replay input timeline.');
    const input = entry.input;
    const fields = ['throttle', 'steer', 'fireFront', 'fireBroadsideLeft', 'fireBroadsideRight'];
    if (
      Object.keys(input).length !== fields.length ||
      Object.keys(input).some((key) => !fields.includes(key))
    )
      throw new Error('Invalid replay input fields.');
    if (
      !Number.isInteger(entry.tick) ||
      entry.tick <= last ||
      entry.tick > replay.endTick ||
      !Number.isFinite(input.throttle) ||
      input.throttle < 0 ||
      input.throttle > 1 ||
      !Number.isFinite(input.steer) ||
      Math.abs(input.steer) > 1 ||
      [input.fireFront, input.fireBroadsideLeft, input.fireBroadsideRight].some(
        (v) => typeof v !== 'boolean',
      )
    )
      throw new Error('Invalid replay input timeline.');
    last = entry.tick;
  }
  last = 0;
  for (const check of replay.checks) {
    if (!check || typeof check !== 'object') throw new Error('Invalid replay checkpoints.');
    if (
      !Number.isInteger(check.tick) ||
      check.tick <= last ||
      check.tick > replay.endTick ||
      !/^[a-f0-9]{8}$/.test(check.hash)
    )
      throw new Error('Invalid replay checkpoints.');
    last = check.tick;
  }
  if (last !== replay.endTick) throw new Error('Replay is missing its final checkpoint.');
}
