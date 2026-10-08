import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AudioManager } from '@/audio/AudioManager';

describe('Ambient loop loading across match exit and restart', () => {
  let audio: AudioManager;
  let responses: ((response: Response) => void)[];
  let createSource: MockInstance<() => AudioBufferSourceNode>;
  let loads: MockInstance<AudioManager['loadSound']>;

  beforeEach(() => {
    audio = AudioManager.getInstance();
    audio.reset();
    responses = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { responses.push(resolve); })));
    const context = (audio as unknown as { ctx: AudioContext }).ctx;
    createSource = vi.mocked(context.createBufferSource);
    vi.clearAllMocks();
    loads = vi.spyOn(audio, 'loadSound');
  });

  afterEach(() => {
    audio.reset();
    loads.mockRestore();
    vi.unstubAllGlobals();
  });

  async function finishLoading(load: Promise<AudioBuffer | null>, request = 0, ok = true) {
    responses[request]!({ ok, arrayBuffer: async () => new ArrayBuffer(16) } as Response);
    await load;
    await Promise.resolve();
  }

  it('keeps the harbor quiet when the match exits before ambience has loaded', async () => {
    audio.startLoop('ocean_ambience_loop');
    audio.stopAllLoops();
    await finishLoading(loads.mock.results[0]!.value);
    expect(createSource).not.toHaveBeenCalled();
    // The downloaded buffer remains available to a later voyage.
    audio.startLoop('ocean_ambience_loop');
    expect(createSource).toHaveBeenCalledTimes(1);
    audio.stopAllLoops();
    expect(createSource.mock.results[0]!.value.stop).toHaveBeenCalledTimes(1);
  });

  it('deduplicates repeated starts while a single loop is loading', async () => {
    for (let i = 0; i < 20; i++) audio.startLoop('ocean_ambience_loop');
    expect(loads).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await finishLoading(loads.mock.results[0]!.value);
    expect(createSource).toHaveBeenCalledTimes(1);
  });

  it('stopping one pending loop leaves the other requested loop intact', async () => {
    audio.startLoop('ocean_ambience_loop');
    audio.startLoop('ship_sailing_loop');
    audio.stopLoop('ocean_ambience_loop');
    await finishLoading(loads.mock.results[0]!.value);
    expect(createSource).not.toHaveBeenCalled();
    await finishLoading(loads.mock.results[1]!.value, 1);
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(createSource.mock.results[0]!.value.loop).toBe(true);
  });

  it.each([true, false])('a stale load cannot start or replace the restarted voyage (old first: %s)', async oldFirst => {
    const context = (audio as unknown as { ctx: AudioContext }).ctx;
    const gains = vi.mocked(context.createGain);
    audio.startLoop('ocean_ambience_loop', .2);
    audio.stopAllLoops();
    audio.startLoop('ocean_ambience_loop', .8);
    if (oldFirst) {
      await finishLoading(loads.mock.results[0]!.value);
      expect(createSource).not.toHaveBeenCalled();
      await finishLoading(loads.mock.results[1]!.value, 1);
    } else {
      await finishLoading(loads.mock.results[1]!.value, 1);
      await finishLoading(loads.mock.results[0]!.value);
    }
    expect(createSource).toHaveBeenCalledTimes(1);
    expect(gains.mock.results[0]!.value.gain.setValueAtTime).toHaveBeenCalledWith(.35 * .8, context.currentTime);
  });

  it('allows a fresh request after a failed load', async () => {
    audio.startLoop('ocean_ambience_loop');
    await finishLoading(loads.mock.results[0]!.value, 0, false);
    expect(createSource).not.toHaveBeenCalled();
    audio.startLoop('ocean_ambience_loop');
    await finishLoading(loads.mock.results[1]!.value, 1);
    expect(createSource).toHaveBeenCalledTimes(1);
  });

  it('honors pause volume changes while the loop is still loading', async () => {
    const context = (audio as unknown as { ctx: AudioContext }).ctx;
    const gains = vi.mocked(context.createGain);
    audio.startLoop('ocean_ambience_loop');
    audio.setLoopVolume('ocean_ambience_loop', 0);
    audio.setLoopVolume('ocean_ambience_loop', NaN);
    await finishLoading(loads.mock.results[0]!.value);
    expect(createSource).toHaveBeenCalledTimes(1);
    const gain = gains.mock.results[0]!.value;
    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, context.currentTime);
    audio.setLoopVolume('ocean_ambience_loop', 1);
    expect(gain.gain.setValueAtTime).toHaveBeenLastCalledWith(.35, context.currentTime);
  });
});
