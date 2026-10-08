import { DEFAULT_GAMEPLAY_CONFIG, type GameplayConfig } from '../../types/config';
import { GameSimulation } from './GameSimulation';
import { SIMULATION_VERSION, validateReplay } from './Replay';
import type { MatchConfigSnapshot, SubmitMatchRequest } from '../../types/api';

export function rankedGameplayConfig(config: MatchConfigSnapshot): GameplayConfig {
  return { ...DEFAULT_GAMEPLAY_CONFIG, sessionDurationSeconds: config.sessionDurationSeconds,
    spawner: { ...DEFAULT_GAMEPLAY_CONFIG.spawner, spawnIntervalSeconds: config.enemySpawnIntervalSeconds } };
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item && typeof item === 'object' && !Array.isArray(item))
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    return item;
  });
}

// The authoritative result comes from fresh physics. Client hashes are debugging
// metadata, not proof: exact floating-point state hashes can differ across runtimes.
export function verifyScore(request: SubmitMatchRequest, seed: number): void {
  const replay = request.replay;
  if (!replay) throw new Error('A complete battle replay is required');
  validateReplay(replay);
  if (replay.version !== SIMULATION_VERSION || 'raid' in replay || 'upgrades' in replay ||
    replay.checks.some(check => check.tick !== replay.endTick && check.tick % 120 !== 0))
    throw new Error('Only classic voyages can enter this leaderboard');
  const config = rankedGameplayConfig(request.config);
  if (replay.seed !== seed || canonical(replay.config) !== canonical(config)) throw new Error('Replay does not match the issued voyage');
  const simulation = new GameSimulation(config, seed);
  try {
    let cursor = 0;
    for (let tick = 1; tick <= replay.endTick && !simulation.isEnded; tick++) {
      const entry = replay.inputs[cursor];
      if (entry?.tick === tick) { simulation.setInputs(entry.input);cursor++; }
      simulation.step(simulation.fixedTimestep);
    }
    if (!simulation.isEnded || simulation.tickCount !== replay.endTick ||
      simulation.score !== request.score || simulation.endReason !== request.endReason ||
      Math.floor(simulation.durationSeconds - simulation.remainingSeconds) !== request.durationSeconds)
      throw new Error('Battle result failed server verification');
  } finally { simulation.destroy(); }
}
