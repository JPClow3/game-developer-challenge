import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../../../src/core/simulation/GameSimulation';
import { stateHash } from '../../../src/core/simulation/Replay';

function record() {
  const sim = new GameSimulation({ sessionDurationSeconds: 60, playerMaxHealth: 5000 }, 42);
  while (!sim.isEnded) {
    if (sim.tickCount % 120 === 0)
      sim.setInputs({ throttle: 1, steer: 0.25, fireFront: true, fireBroadsideLeft: true });
    sim.step(sim.fixedTimestep);
  }
  return sim;
}

describe('Replay transport', () => {
  it.each([0.5, 1, 2, 4])(
    'verifies every checkpoint at %sx on 30 Hz and 144 Hz displays',
    (speed) => {
      const original = record();
      try {
        for (const hz of [30, 144]) {
          const replay = new GameSimulation(undefined, undefined, {
            replay: original.getReplay()!,
          });
          try {
            replay.setReplaySpeed(speed);
            for (let frame = 0; frame < hz; frame++) replay.update(1 / hz);
            expect(replay.elapsedSeconds).toBeCloseTo(speed, 1);
            const tick = replay.tickCount;
            replay.pause();
            replay.update(1);
            expect(replay.tickCount).toBe(tick);
            replay.resume();
            let frames = hz;
            while (!replay.isEnded && frames++ < hz * 130) replay.update(1 / hz);
            expect(replay.replayStatus).toBe('verified');
            expect(stateHash(replay)).toBe(stateHash(original));
            expect(frames / hz).toBeCloseTo(original.elapsedSeconds / speed, 1);
          } finally {
            replay.destroy();
          }
        }
      } finally {
        original.destroy();
      }
    },
  );

  it('changes pace mid-replay without skipping tamper checks or changing live battle speed', () => {
    const original = record();
    const replay = new GameSimulation(undefined, undefined, { replay: original.getReplay()! });
    const live = new GameSimulation();
    try {
      live.setReplaySpeed(4);
      expect(live.replaySpeed).toBe(1);
      live.update(1 / 60);
      expect(live.tickCount).toBe(1);
      for (const speed of [0.5, 4, 2, 1]) {
        replay.setReplaySpeed(speed);
        for (let i = 0; i < 50; i++) replay.update(1 / 60);
      }
      for (const invalid of [0, -1, 100, NaN, Infinity]) replay.setReplaySpeed(invalid);
      expect(replay.replaySpeed).toBe(1);
      while (!replay.isEnded) replay.update(1 / 60);
      expect(replay.replayStatus).toBe('verified');
      const altered = original.getReplay()!;
      altered.checks[0]!.hash = altered.checks[0]!.hash === '00000000' ? 'ffffffff' : '00000000';
      const corrupt = new GameSimulation(undefined, undefined, { replay: altered });
      try {
        corrupt.setReplaySpeed(4);
        while (!corrupt.isEnded) corrupt.update(1 / 30);
        expect(corrupt.replayStatus).toBe('diverged');
        expect(corrupt.tickCount).toBe(altered.checks[0]!.tick);
      } finally {
        corrupt.destroy();
      }
    } finally {
      original.destroy();
      replay.destroy();
      live.destroy();
    }
  });
});
