import { describe, it, expect, beforeEach } from 'vitest';
import { AudioManager } from '@/audio/AudioManager';


describe('AudioManager Web Audio API Sound Management', () => {
  beforeEach(() => {
    AudioManager.getInstance().reset();
  });

  it('enforces singleton pattern', () => {
    const audioA = AudioManager.getInstance();
    const audioB = AudioManager.getInstance();
    expect(audioA).toBe(audioB);
  });

  it('manages master, sfx, and music volumes with clamping', () => {
    const audio = AudioManager.getInstance();

    audio.setMasterVolume(0.5);
    expect(audio.getSettings().masterVolume).toBe(0.5);

    // Clamping to [0, 1]
    audio.setMasterVolume(1.5);
    expect(audio.getSettings().masterVolume).toBe(1.0);

    audio.setMasterVolume(-0.2);
    expect(audio.getSettings().masterVolume).toBe(0.0);

    audio.setSfxVolume(0.7);
    expect(audio.getSettings().sfxVolume).toBe(0.7);

    audio.setMusicVolume(0.4);
    expect(audio.getSettings().musicVolume).toBe(0.4);
  });

  it('handles mute toggle correctly', () => {
    const audio = AudioManager.getInstance();
    expect(audio.getSettings().isMuted).toBe(false);

    audio.setMuted(true);
    expect(audio.getSettings().isMuted).toBe(true);

    audio.setMuted(false);
    expect(audio.getSettings().isMuted).toBe(false);
  });

  it('handles user gesture unlock AudioContext resumption', async () => {
    const audio = AudioManager.getInstance();
    const result = await audio.unlockAudio();
    expect(typeof result).toBe('boolean');
  });

  it('manages ambient loops start, stop, and volume update', () => {
    const audio = AudioManager.getInstance();

    expect(() => {
      audio.startLoop('ocean_ambience_loop', 0.5);
      audio.setLoopVolume('ocean_ambience_loop', 0.8);
      audio.stopLoop('ocean_ambience_loop');
      audio.stopAllLoops();
    }).not.toThrow();
  });

  it('guards SFX playback against voice clipping', () => {
    const audio = AudioManager.getInstance();

    // Triggering when not muted
    expect(() => {
      audio.playSfx('cannon_fire_1');
      audio.playSfx('ui_click');
    }).not.toThrow();

    // When muted, playSfx returns null immediately
    audio.setMuted(true);
    const result = audio.playSfx('cannon_fire_1');
    expect(result).toBeNull();
  });

  it('guards against NaN and non-finite volume inputs without mutating state or throwing', () => {
    const audio = AudioManager.getInstance();
    audio.setMasterVolume(0.8);
    audio.setSfxVolume(0.7);
    audio.setMusicVolume(0.5);

    // Attempt invalid updates with NaN
    audio.setMasterVolume(NaN);
    audio.setSfxVolume(NaN);
    audio.setMusicVolume(NaN);

    expect(audio.getSettings().masterVolume).toBe(0.8);
    expect(audio.getSettings().sfxVolume).toBe(0.7);
    expect(audio.getSettings().musicVolume).toBe(0.5);

    // Attempt invalid updates with +/- Infinity
    audio.setMasterVolume(Infinity);
    audio.setSfxVolume(-Infinity);
    audio.setMusicVolume(Infinity);

    expect(audio.getSettings().masterVolume).toBe(0.8);
    expect(audio.getSettings().sfxVolume).toBe(0.7);
    expect(audio.getSettings().musicVolume).toBe(0.5);

    // Verify playSfx and loop operations with non-finite volumeScale do not throw Web Audio TypeErrors
    expect(() => {
      audio.playSfx('cannon_fire_1', NaN);
      audio.playSfx('cannon_fire_1', Infinity);
      audio.startLoop('ocean_ambience_loop', NaN);
      audio.setLoopVolume('ocean_ambience_loop', NaN);
      audio.setLoopVolume('ocean_ambience_loop', Infinity);
      audio.stopLoop('ocean_ambience_loop');
    }).not.toThrow();
  });
});
