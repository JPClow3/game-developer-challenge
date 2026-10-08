import { expect, it } from 'vitest';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import { validateReplay, type BattleReplay } from '../../../src/core/simulation/Replay';
import recording from '../../fixtures/classic-v2-before-removal.json';

// Recorded with the pre-removal engine, seed 42, cannon pulses and a pause/resume.
it.each([30, 60, 144])('verifies the pre-removal Classic recording at %i Hz', (hz) => {
  const replay = recording as BattleReplay;
  validateReplay(replay);
  const sim = new GameSimulation(undefined, undefined, { replay });
  try {
    while (!sim.isEnded && sim.tickCount <= replay.endTick) sim.update(1 / hz);
    expect(sim.replayStatus).toBe('verified');
    expect(sim.tickCount).toBe(3601);
    expect(sim.score).toBe(3);
    expect(sim.endReason).toBe('time_expired');
  } finally {
    sim.destroy();
  }
});

it('rejects prototype rulesets and extra scoring metadata', () => {
  for (const version of ['pirate-battle-raid-1', 'pirate-battle-raid-2', 'pirate-battle-raid-3']) {
    expect(() => validateReplay({ ...recording, version } as BattleReplay)).toThrow('incompatible');
  }
  expect(() => validateReplay({ ...recording, raid: { ship: 'brig' } } as BattleReplay)).toThrow(
    'ruleset',
  );
});
