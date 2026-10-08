/**
 * AudioManager: Web Audio API Sound Manager
 * Handles user gesture unlock, volume controls, SFX triggers, voice limiting, and ambient loops.
 */

import { SOUND_MANIFEST, type SoundId } from '../assets/AssetLoader';

export interface AudioSettings {
  masterVolume: number; // 0.0 - 1.0
  sfxVolume: number;    // 0.0 - 1.0
  musicVolume: number;  // 0.0 - 1.0
  isMuted: boolean;
}

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 1.0,
  sfxVolume: 0.8,
  musicVolume: 0.6,
  isMuted: false,
};

export class AudioManager {
  private static instance: AudioManager | null = null;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private bufferCache = new Map<SoundId, AudioBuffer>();
  private activeLoops = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private pendingLoops = new Map<string, { volumeScale: number }>();
  private activeSfxVoiceCount = new Map<SoundId, number>();

  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private isUnlocked = false;
  private maxConcurrentVoicesPerSound = 4;

  private constructor() {
    this.initAudioContext();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private initAudioContext(): void {
    if (typeof window === 'undefined') return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();

      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.applyVolumes();
      this.setupUnlockListeners();
    } catch {
      // AudioContext unavailable
    }
  }

  /**
   * Browser autoplay policy requires user gesture (click/touch/keydown) to resume AudioContext
   */
  private setupUnlockListeners(): void {
    if (typeof window === 'undefined') return;

    const unlock = async () => {
      await this.unlockAudio();
      if (this.isUnlocked) {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      }
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });

    // Auto-resume AudioContext on tab visibility restore if previously unlocked
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          this.isUnlocked &&
          this.ctx &&
          (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted')
        ) {
          this.ctx.resume().catch(() => {});
        }
      });
    }
  }

  public async unlockAudio(): Promise<boolean> {
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended' || (this.ctx.state as string) === 'interrupted') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    if (this.ctx.state === 'running') {
      this.isUnlocked = true;
      return true;
    }
    return false;
  }

  public getContextState(): AudioContextState | 'unavailable' {
    return this.ctx?.state ?? 'unavailable';
  }

  private applyVolumes(): void {
    if (!this.masterGain || !this.sfxGain || !this.musicGain || !this.ctx) return;

    const targetMaster = this.settings.isMuted
      ? 0
      : (typeof this.settings.masterVolume === 'number' && Number.isFinite(this.settings.masterVolume) ? this.settings.masterVolume : 1.0);
    const targetSfx = typeof this.settings.sfxVolume === 'number' && Number.isFinite(this.settings.sfxVolume) ? this.settings.sfxVolume : 0.8;
    const targetMusic = typeof this.settings.musicVolume === 'number' && Number.isFinite(this.settings.musicVolume) ? this.settings.musicVolume : 0.6;

    this.masterGain.gain.setValueAtTime(targetMaster, this.ctx.currentTime);
    this.sfxGain.gain.setValueAtTime(targetSfx, this.ctx.currentTime);
    this.musicGain.gain.setValueAtTime(targetMusic, this.ctx.currentTime);
  }

  public setMasterVolume(volume: number): void {
    if (typeof volume !== 'number' || !Number.isFinite(volume)) return;
    this.settings.masterVolume = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
  }

  public setSfxVolume(volume: number): void {
    if (typeof volume !== 'number' || !Number.isFinite(volume)) return;
    this.settings.sfxVolume = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
  }

  public setMusicVolume(volume: number): void {
    if (typeof volume !== 'number' || !Number.isFinite(volume)) return;
    this.settings.musicVolume = Math.max(0, Math.min(1, volume));
    this.applyVolumes();
  }

  public setMuted(muted: boolean): void {
    this.settings.isMuted = muted;
    this.applyVolumes();
  }

  public getSettings(): Readonly<AudioSettings> {
    return { ...this.settings };
  }

  /**
   * Preload an audio file into AudioBuffer
   */
  public async loadSound(id: SoundId): Promise<AudioBuffer | null> {
    if (this.bufferCache.has(id)) {
      return this.bufferCache.get(id)!;
    }
    if (!this.ctx) return null;

    const manifestEntry = SOUND_MANIFEST[id];
    if (!manifestEntry) return null;

    try {
      const response = await fetch(`/assets/sounds/${manifestEntry.filename}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio: ${manifestEntry.filename}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(id, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }

  /**
   * Preload core audio sounds
   */
  public async preloadCoreAudio(): Promise<void> {
    const coreSounds: SoundId[] = [
      'ocean_ambience_loop',
      'cannon_fire_1',
      'cannon_fire_2',
      'cannon_broadside',
      'ship_wood_hit_1',
      'ship_explosion_1',
      'score_point',
      'ui_click',
      'ui_hover',
    ];
    await Promise.all(coreSounds.map((id) => this.loadSound(id)));
  }

  /**
   * Play SFX with voice limiting and volume scaling
   */
  public playSfx(id: SoundId, volumeScale = 1.0): AudioBufferSourceNode | null {
    if (!this.ctx || !this.sfxGain || this.settings.isMuted) return null;

    // Check voice limit to prevent distortion/clipping
    const activeVoices = this.activeSfxVoiceCount.get(id) || 0;
    if (activeVoices >= this.maxConcurrentVoicesPerSound) {
      return null;
    }

    const buffer = this.bufferCache.get(id);
    if (!buffer) {
      // Lazy load in background for subsequent triggers
      this.loadSound(id);
      return null;
    }

    const manifest = SOUND_MANIFEST[id];
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;

    const gainNode = this.ctx.createGain();
    const safeScale = (typeof volumeScale === 'number' && Number.isFinite(volumeScale))
      ? Math.max(0, Math.min(2, volumeScale))
      : 1.0;
    const finalVolume = (manifest?.defaultVolume ?? 0.8) * safeScale;
    gainNode.gain.setValueAtTime(finalVolume, this.ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(this.sfxGain);

    this.activeSfxVoiceCount.set(id, activeVoices + 1);
    source.onended = () => {
      const count = this.activeSfxVoiceCount.get(id) || 1;
      this.activeSfxVoiceCount.set(id, Math.max(0, count - 1));
      gainNode.disconnect();
    };

    source.start(0);
    return source;
  }

  /**
   * Unified play helper for sounds and ambient loops
   */
  public play(id: SoundId, volumeScale = 1.0): void {
    if (id === 'ocean_ambience_loop' || id === 'ship_sailing_loop') {
      this.startLoop(id, volumeScale);
    } else {
      this.playSfx(id, volumeScale);
    }
  }

  /**
   * Start looping ambient sound (e.g. ocean ambience or sailing loop)
   */
  public startLoop(id: 'ocean_ambience_loop' | 'ship_sailing_loop', volumeScale = 1.0): void {
    if (this.activeLoops.has(id) || this.pendingLoops.has(id) || !this.ctx || !this.musicGain) return;

    const buffer = this.bufferCache.get(id);
    if (!buffer) {
      const request = { volumeScale };
      this.pendingLoops.set(id, request);
      this.loadSound(id).then((loaded) => {
        // Match exit or a newer voyage can invalidate this asynchronous start.
        if (this.pendingLoops.get(id) !== request) return;
        this.pendingLoops.delete(id);
        if (loaded) this.startLoop(id, request.volumeScale);
      });
      return;
    }

    const manifest = SOUND_MANIFEST[id];
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gainNode = this.ctx.createGain();
    const safeScale = (typeof volumeScale === 'number' && Number.isFinite(volumeScale))
      ? Math.max(0, Math.min(2, volumeScale))
      : 1.0;
    const initialVolume = (manifest?.defaultVolume ?? 0.3) * safeScale;
    gainNode.gain.setValueAtTime(initialVolume, this.ctx.currentTime);

    source.connect(gainNode);
    gainNode.connect(this.musicGain);

    source.start(0);
    this.activeLoops.set(id, { source, gain: gainNode });
  }

  /**
   * Stop loop
   */
  public stopLoop(id: string): void {
    this.pendingLoops.delete(id);
    const loop = this.activeLoops.get(id);
    if (loop) {
      try {
        loop.source.stop();
        loop.gain.disconnect();
      } catch {
        // already stopped
      }
      this.activeLoops.delete(id);
    }
  }

  public stopAllLoops(): void {
    this.pendingLoops.clear();
    for (const [id] of this.activeLoops) {
      this.stopLoop(id);
    }
  }

  public setLoopVolume(id: string, volumeScale: number): void {
    if (typeof volumeScale !== 'number' || !Number.isFinite(volumeScale)) return;
    const pending = this.pendingLoops.get(id);
    if (pending) pending.volumeScale = volumeScale;
    const loop = this.activeLoops.get(id);
    if (loop && this.ctx) {
      const manifest = SOUND_MANIFEST[id as SoundId];
      const baseVol = manifest?.defaultVolume ?? 0.3;
      const safeScale = Math.max(0, Math.min(2, volumeScale));
      loop.gain.gain.setValueAtTime(baseVol * safeScale, this.ctx.currentTime);
    }
  }

  /**
   * Reset instance (for testing)
   */
  public reset(): void {
    this.stopAllLoops();
    this.bufferCache.clear();
    this.activeSfxVoiceCount.clear();
  }
}
