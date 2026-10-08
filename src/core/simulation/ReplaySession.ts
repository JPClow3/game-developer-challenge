import type { GameSimulation, PlayerInputState } from './GameSimulation';
import { DEFAULT_PLAYER_INPUT } from './GameSimulation';
import { SIMULATION_VERSION, VOYAGE_SIMULATION_VERSION, stateHash, validateReplay, type BattleReplay } from './Replay';
import type { GameplayConfig } from '../../types';

/** Input recording, fixed-tick playback and state verification. No combat rules. */
export class ReplaySession {
  public readonly playback?: BattleReplay;
  public status: 'playing' | 'verified' | 'diverged' = 'playing';
  public error: string | null = null;
  public speed = 1;
  private recording: BattleReplay;
  private inputCursor = 0;
  private checkCursor = 0;
  private lastRecordedInput = '';
  private playbackInput: PlayerInputState = { ...DEFAULT_PLAYER_INPUT };

  constructor(seed: number, config: GameplayConfig, replay?: BattleReplay) {
    if (replay) validateReplay(replay);
    this.playback = replay ? structuredClone(replay) : undefined;
    this.recording = this.newRecording(seed, config);
  }

  private newRecording(seed: number, config: GameplayConfig): BattleReplay {
    return {
      version: config.voyage ? VOYAGE_SIMULATION_VERSION : SIMULATION_VERSION,
      seed,
      config: structuredClone(config),
      inputs: [],
      checks: [],
      endTick: 0,
    };
  }

  public reset(seed: number, config: GameplayConfig): void {
    this.recording = this.newRecording(seed, config);
    this.inputCursor = 0;
    this.checkCursor = 0;
    this.lastRecordedInput = '';
    this.playbackInput = { ...DEFAULT_PLAYER_INPUT };
    this.status = 'playing';
    this.error = null;
  }

  public inputForTick(tick: number, input: PlayerInputState, record: boolean): PlayerInputState {
    if (this.playback) {
      const entry = this.playback.inputs[this.inputCursor];
      if (entry?.tick === tick) {
        this.playbackInput = { ...entry.input };
        this.inputCursor++;
      }
      return { ...this.playbackInput };
    }
    if (record) {
      const serialized = JSON.stringify(input);
      if (serialized !== this.lastRecordedInput) {
        this.recording.inputs.push({ tick, input });
        this.lastRecordedInput = serialized;
      }
    }
    return input;
  }

  private checkpoint(sim: GameSimulation): void {
    const check = { tick: sim.tickCount, hash: stateHash(sim) };
    if (this.recording.checks.at(-1)?.tick === check.tick) this.recording.checks.pop();
    this.recording.checks.push(check);
  }

  public finishTick(sim: GameSimulation): void {
    if (sim.mode === 'match' && (sim.tickCount % 120 === 0 || sim.isEnded)) this.checkpoint(sim);
    if (this.playback) {
      const check = this.playback.checks[this.checkCursor];
      if (check?.tick === sim.tickCount) {
        this.checkCursor++;
        if (stateHash(sim) !== check.hash) {
          this.status = 'diverged';
          this.error = `Replay diverged at tick ${sim.tickCount}.`;
          sim.isEnded = true;
          sim.emit('replay_finished');
          return;
        }
      }
      if (sim.tickCount === this.playback.endTick || sim.isEnded) {
        this.status =
          sim.tickCount === this.playback.endTick && sim.isEnded ? 'verified' : 'diverged';
        if (this.status === 'diverged')
          this.error = `Replay ended unexpectedly at tick ${sim.tickCount}.`;
        sim.isEnded = true;
        sim.emit('replay_finished');
      }
    }
  }

  public export(sim: GameSimulation): BattleReplay | null {
    if (
      sim.mode !== 'match' ||
      !sim.isEnded ||
      sim.endReason === 'abandoned' ||
      sim.tickCount === 0
    )
      return null;
    this.checkpoint(sim);
    this.recording.endTick = sim.tickCount;
    return structuredClone(this.recording);
  }
}
