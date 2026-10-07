/**
 * AssetLoader: Singleton Asset Preloader with Promise Caching & Texture Pipelines
 * Safe against React 18 Strict Mode double-mounts.
 */

import { Assets, Texture, Rectangle } from 'pixi.js';
import type { DamageTier, ShipSeries } from '../types/game';

export interface SoundManifestEntry {
  filename: string;
  durationSeconds: number;
  channels: 1 | 2;
  category: 'ambience' | 'combat' | 'impact' | 'explosion' | 'defeat' | 'hud' | 'warning' | 'lifecycle' | 'ui';
  loop: boolean;
  defaultVolume: number;
}

export type SoundId =
  | 'ocean_ambience_loop'
  | 'ship_sailing_loop'
  | 'cannon_fire_1'
  | 'cannon_fire_2'
  | 'cannon_fire_3'
  | 'cannon_broadside'
  | 'cannonball_water_hit_1'
  | 'cannonball_water_hit_2'
  | 'ship_wood_hit_1'
  | 'ship_wood_hit_2'
  | 'ship_collision'
  | 'ship_explosion_1'
  | 'ship_explosion_2'
  | 'ship_sinking'
  | 'score_point'
  | 'health_low'
  | 'time_warning'
  | 'game_start'
  | 'game_pause'
  | 'game_resume'
  | 'game_complete'
  | 'game_over'
  | 'ui_hover'
  | 'ui_click'
  | 'ui_open'
  | 'ui_close'
  | 'ui_back';

export const SOUND_MANIFEST: Record<SoundId, SoundManifestEntry> = {
  ocean_ambience_loop: {
    filename: 'ocean_ambience_loop.wav',
    durationSeconds: 12.0,
    channels: 2,
    category: 'ambience',
    loop: true,
    defaultVolume: 0.35,
  },
  ship_sailing_loop: {
    filename: 'ship_sailing_loop.wav',
    durationSeconds: 8.0,
    channels: 2,
    category: 'ambience',
    loop: true,
    defaultVolume: 0.30,
  },
  cannon_fire_1: {
    filename: 'cannon_fire_1.wav',
    durationSeconds: 1.18,
    channels: 1,
    category: 'combat',
    loop: false,
    defaultVolume: 0.80,
  },
  cannon_fire_2: {
    filename: 'cannon_fire_2.wav',
    durationSeconds: 1.25,
    channels: 1,
    category: 'combat',
    loop: false,
    defaultVolume: 0.80,
  },
  cannon_fire_3: {
    filename: 'cannon_fire_3.wav',
    durationSeconds: 1.32,
    channels: 1,
    category: 'combat',
    loop: false,
    defaultVolume: 0.75,
  },
  cannon_broadside: {
    filename: 'cannon_broadside.wav',
    durationSeconds: 1.70,
    channels: 1,
    category: 'combat',
    loop: false,
    defaultVolume: 0.90,
  },
  cannonball_water_hit_1: {
    filename: 'cannonball_water_hit_1.wav',
    durationSeconds: 0.92,
    channels: 1,
    category: 'impact',
    loop: false,
    defaultVolume: 0.50,
  },
  cannonball_water_hit_2: {
    filename: 'cannonball_water_hit_2.wav',
    durationSeconds: 1.08,
    channels: 1,
    category: 'impact',
    loop: false,
    defaultVolume: 0.50,
  },
  ship_wood_hit_1: {
    filename: 'ship_wood_hit_1.wav',
    durationSeconds: 0.60,
    channels: 1,
    category: 'impact',
    loop: false,
    defaultVolume: 0.85,
  },
  ship_wood_hit_2: {
    filename: 'ship_wood_hit_2.wav',
    durationSeconds: 0.60,
    channels: 1,
    category: 'impact',
    loop: false,
    defaultVolume: 0.85,
  },
  ship_collision: {
    filename: 'ship_collision.wav',
    durationSeconds: 1.45,
    channels: 1,
    category: 'impact',
    loop: false,
    defaultVolume: 0.90,
  },
  ship_explosion_1: {
    filename: 'ship_explosion_1.wav',
    durationSeconds: 2.40,
    channels: 1,
    category: 'explosion',
    loop: false,
    defaultVolume: 0.95,
  },
  ship_explosion_2: {
    filename: 'ship_explosion_2.wav',
    durationSeconds: 2.60,
    channels: 1,
    category: 'explosion',
    loop: false,
    defaultVolume: 0.95,
  },
  ship_sinking: {
    filename: 'ship_sinking.wav',
    durationSeconds: 3.30,
    channels: 1,
    category: 'defeat',
    loop: false,
    defaultVolume: 0.90,
  },
  score_point: {
    filename: 'score_point.wav',
    durationSeconds: 0.50,
    channels: 1,
    category: 'hud',
    loop: false,
    defaultVolume: 0.70,
  },
  health_low: {
    filename: 'health_low.wav',
    durationSeconds: 0.85,
    channels: 1,
    category: 'warning',
    loop: false,
    defaultVolume: 0.75,
  },
  time_warning: {
    filename: 'time_warning.wav',
    durationSeconds: 0.48,
    channels: 1,
    category: 'warning',
    loop: false,
    defaultVolume: 0.75,
  },
  game_start: {
    filename: 'game_start.wav',
    durationSeconds: 1.25,
    channels: 1,
    category: 'lifecycle',
    loop: false,
    defaultVolume: 0.80,
  },
  game_pause: {
    filename: 'game_pause.wav',
    durationSeconds: 0.55,
    channels: 1,
    category: 'lifecycle',
    loop: false,
    defaultVolume: 0.60,
  },
  game_resume: {
    filename: 'game_resume.wav',
    durationSeconds: 0.55,
    channels: 1,
    category: 'lifecycle',
    loop: false,
    defaultVolume: 0.60,
  },
  game_complete: {
    filename: 'game_complete.wav',
    durationSeconds: 1.50,
    channels: 1,
    category: 'lifecycle',
    loop: false,
    defaultVolume: 0.85,
  },
  game_over: {
    filename: 'game_over.wav',
    durationSeconds: 1.60,
    channels: 1,
    category: 'lifecycle',
    loop: false,
    defaultVolume: 0.85,
  },
  ui_hover: {
    filename: 'ui_hover.wav',
    durationSeconds: 0.13,
    channels: 1,
    category: 'ui',
    loop: false,
    defaultVolume: 0.30,
  },
  ui_click: {
    filename: 'ui_click.wav',
    durationSeconds: 0.23,
    channels: 1,
    category: 'ui',
    loop: false,
    defaultVolume: 0.60,
  },
  ui_open: {
    filename: 'ui_open.wav',
    durationSeconds: 0.60,
    channels: 1,
    category: 'ui',
    loop: false,
    defaultVolume: 0.50,
  },
  ui_close: {
    filename: 'ui_close.wav',
    durationSeconds: 0.60,
    channels: 1,
    category: 'ui',
    loop: false,
    defaultVolume: 0.50,
  },
  ui_back: {
    filename: 'ui_back.wav',
    durationSeconds: 0.48,
    channels: 1,
    category: 'ui',
    loop: false,
    defaultVolume: 0.48,
  },
};

/**
 * Kenney Ship Deterioration Grid (24 ships across 6 series and 4 stages)
 */
export const SHIP_DETERIORATION_MAP: Record<ShipSeries, Record<DamageTier, string>> = {
  1: { 1: 'ship_1.png', 2: 'ship_7.png', 3: 'ship_13.png', 4: 'ship_19.png' }, // White/Player
  2: { 1: 'ship_2.png', 2: 'ship_8.png', 3: 'ship_14.png', 4: 'ship_20.png' }, // Corsair/Chaser
  3: { 1: 'ship_3.png', 2: 'ship_9.png', 3: 'ship_15.png', 4: 'ship_21.png' }, // Crimson/Shooter
  4: { 1: 'ship_4.png', 2: 'ship_10.png', 3: 'ship_16.png', 4: 'ship_22.png' }, // Emerald
  5: { 1: 'ship_5.png', 2: 'ship_11.png', 3: 'ship_17.png', 4: 'ship_23.png' }, // Navy Blue
  6: { 1: 'ship_6.png', 2: 'ship_12.png', 3: 'ship_18.png', 4: 'ship_24.png' }, // Royal Gold
};

export const OPEN_WATER_TILE_ID = 73;
export const TOTAL_TILES_COUNT = 96;
export const TILES_PER_ROW = 16;
export const TILE_UNIT_SIZE = 64;

export const UI_PANEL_BORDERS = {
  left: 32,
  top: 40,
  right: 32,
  bottom: 40,
} as const;

export interface SubTextureDef {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const KENNEY_SHIP_SUBTEXTURES: Record<string, SubTextureDef> = {
  'ship_1.png': { x: 408, y: 0, width: 66, height: 113 },
  'ship_2.png': { x: 408, y: 115, width: 66, height: 113 },
  'ship_3.png': { x: 204, y: 115, width: 66, height: 113 },
  'ship_4.png': { x: 68, y: 192, width: 66, height: 113 },
  'ship_5.png': { x: 68, y: 77, width: 66, height: 113 },
  'ship_6.png': { x: 68, y: 307, width: 66, height: 113 },
  'ship_7.png': { x: 0, y: 192, width: 66, height: 113 },
  'ship_8.png': { x: 0, y: 307, width: 66, height: 113 },
  'ship_9.png': { x: 0, y: 77, width: 66, height: 113 },
  'ship_10.png': { x: 340, y: 345, width: 66, height: 113 },
  'ship_11.png': { x: 340, y: 230, width: 66, height: 113 },
  'ship_12.png': { x: 340, y: 115, width: 66, height: 113 },
  'ship_13.png': { x: 340, y: 0, width: 66, height: 113 },
  'ship_14.png': { x: 272, y: 345, width: 66, height: 113 },
  'ship_15.png': { x: 272, y: 230, width: 66, height: 113 },
  'ship_16.png': { x: 272, y: 115, width: 66, height: 113 },
  'ship_17.png': { x: 272, y: 0, width: 66, height: 113 },
  'ship_18.png': { x: 204, y: 345, width: 66, height: 113 },
  'ship_19.png': { x: 204, y: 230, width: 66, height: 113 },
  'ship_20.png': { x: 204, y: 0, width: 66, height: 113 },
  'ship_21.png': { x: 136, y: 345, width: 66, height: 113 },
  'ship_22.png': { x: 136, y: 230, width: 66, height: 113 },
  'ship_23.png': { x: 136, y: 115, width: 66, height: 113 },
  'ship_24.png': { x: 136, y: 0, width: 66, height: 113 },
  'cannon.png': { x: 88, y: 422, width: 29, height: 16 },
  'cannon_ball.png': { x: 120, y: 29, width: 10, height: 10 },
  'explosion_1.png': { x: 0, y: 0, width: 74, height: 75 },
  'explosion_2.png': { x: 544, y: 145, width: 60, height: 59 },
  'explosion_3.png': { x: 544, y: 426, width: 42, height: 41 },
  'fire_1.png': { x: 614, y: 466, width: 18, height: 39 },
  'fire_2.png': { x: 120, y: 0, width: 11, height: 27 },
};

export class AssetLoader {
  private static instance: AssetLoader | null = null;
  private loadPromise: Promise<void> | null = null;
  private isLoaded = false;
  private tileTextures = new Map<number, Texture>();

  private constructor() {}

  public static getInstance(): AssetLoader {
    if (!AssetLoader.instance) {
      AssetLoader.instance = new AssetLoader();
    }
    return AssetLoader.instance;
  }

  /**
   * Calculate Kenney damage deterioration stage based on current health percentage
   */
  public static calculateDamageTier(currentHealth: number, maxHealth: number): DamageTier {
    if (maxHealth <= 0) return 4;
    const ratio = Math.max(0, Math.min(1, currentHealth / maxHealth));
    if (ratio > 0.75) return 1;
    if (ratio > 0.50) return 2;
    if (ratio > 0.25) return 3;
    return 4;
  }

  /**
   * Map ship entity role to its canonical faction series
   */
  public static getShipSeriesForEntity(type: 'player' | 'chaser' | 'shooter'): ShipSeries {
    switch (type) {
      case 'player':
        return 1;
      case 'chaser':
        return 2;
      case 'shooter':
        return 3;
    }
  }

  /**
   * Get ship frame name from series and damage tier
   */
  public static getShipFrameName(series: ShipSeries, tier: DamageTier): string {
    const seriesMap = SHIP_DETERIORATION_MAP[series] || SHIP_DETERIORATION_MAP[1];
    return seriesMap[tier] || seriesMap[1];
  }

  /**
   * Get 16x6 tile sheet row and column coordinates (1-based tile index 1..96)
   */
  public static getTileCoordinate(tileIndex: number): { col: number; row: number; x: number; y: number } {
    const clampedIndex = Math.max(1, Math.min(TOTAL_TILES_COUNT, Math.floor(tileIndex)));
    const zeroBased = clampedIndex - 1;
    const col = zeroBased % TILES_PER_ROW;
    const row = Math.floor(zeroBased / TILES_PER_ROW);
    return {
      col,
      row,
      x: col * TILE_UNIT_SIZE,
      y: row * TILE_UNIT_SIZE,
    };
  }

  public isReady(): boolean {
    return this.isLoaded;
  }

  /**
   * Preload game assets with singleton promise caching and progress callback
   */
  public preload(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isLoaded) {
      onProgress?.(1.0);
      return Promise.resolve();
    }

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = this.executeLoad(onProgress);
    return this.loadPromise;
  }


  private async executeLoad(onProgress?: (progress: number) => void): Promise<void> {
    try {
      onProgress?.(0.05);

      // In test or non-browser environments where WebGL is unavailable, complete gracefully
      if (typeof window === 'undefined') {
        this.isLoaded = true;
        onProgress?.(1.0);
        return;
      }

      const isRetina = typeof window !== 'undefined' && (window.devicePixelRatio || 1) > 1.25;
      const uiAtlasPath = isRetina
        ? '/assets/spritesheet/ui_sheet_retina.json'
        : '/assets/spritesheet/ui_sheet.json';

      console.log('[ASSETS] Starting asset preload, isRetina:', isRetina);

      // 1. Load UI Spritesheet Atlas
      try {
        console.log('[ASSETS] Loading UI atlas:', uiAtlasPath);
        await Assets.load(uiAtlasPath);
        console.log('[ASSETS] UI atlas loaded');
      } catch (e) {
        console.warn('[ASSETS] UI atlas load failed:', e);
        // Fallback to 1x if retina fails
        if (isRetina) {
          console.log('[ASSETS] Trying 1x fallback UI atlas');
          await Assets.load('/assets/spritesheet/ui_sheet.json');
        } else {
          throw e;
        }
      }
      onProgress?.(0.35);

      // 2. Load Ships & Miscellaneous Sheet
      const shipsPngPath = isRetina
        ? '/assets/spritesheet/ships_miscellaneous_sheet_retina.png'
        : '/assets/spritesheet/ships_miscellaneous_sheet.png';
      console.log('[ASSETS] Loading ships sheet:', shipsPngPath);
      const shipsTexture = await Assets.load<Texture>(shipsPngPath);
      console.log('[ASSETS] Ships sheet loaded, slicing textures');
      this.generateShipTextures(shipsTexture);
      onProgress?.(0.60);

      // 3. Load Environment Tilesheet & build 96 tile sub-textures
      const tilesPngPath = isRetina
        ? '/assets/tilesheet/tiles_sheet_retina.png'
        : '/assets/tilesheet/tiles_sheet.png';
      console.log('[ASSETS] Loading tiles sheet:', tilesPngPath);
      const tilesTexture = await Assets.load<Texture>(tilesPngPath);
      console.log('[ASSETS] Tiles sheet loaded, generating textures');
      this.generateTileTextures(tilesTexture, isRetina ? 2 : 1);
      onProgress?.(0.85);

      // 4. Background texture
      console.log('[ASSETS] Loading background texture');
      await Assets.load('/assets/ui_scene_background.png').catch(() => null);
      console.log('[ASSETS] Background texture loaded');

      onProgress?.(1.0);
      this.isLoaded = true;
      console.log('[ASSETS] All assets successfully loaded!');
    } catch (error) {
      console.error('[ASSETS] Asset loading failed:', error);
      this.loadPromise = null; // Clear so user can retry
      throw error;
    }
  }

  /**
   * Slice 1024x384 tilesheet into 96 individual 64x64 textures
   */
  private generateTileTextures(sourceTexture: Texture, scale = 1): void {
    const unit = TILE_UNIT_SIZE * scale;
    for (let k = 1; k <= TOTAL_TILES_COUNT; k++) {
      const coord = AssetLoader.getTileCoordinate(k);
      const rect = new Rectangle(coord.col * unit, coord.row * unit, unit, unit);
      const tileTex = new Texture({
        source: sourceTexture.source,
        frame: rect,
      });
      this.tileTextures.set(k, tileTex);
    }
  }

  /**
   * Slice Kenney ship spritesheet into 24 ship deterioration frames and VFX textures
   */
  private generateShipTextures(sourceTexture: Texture): void {
    if (!sourceTexture || !sourceTexture.source) return;
    for (const [name, def] of Object.entries(KENNEY_SHIP_SUBTEXTURES)) {
      const rect = new Rectangle(def.x, def.y, def.width, def.height);
      const subTex = new Texture({
        source: sourceTexture.source,
        frame: rect,
      });
      Assets.cache.set(name, subTex);
    }
  }

  public getTileTexture(tileIndex: number): Texture | undefined {
    return this.tileTextures.get(tileIndex);
  }

  /**
   * Reset loader state (primarily for automated tests)
   */
  public reset(): void {
    this.isLoaded = false;
    this.loadPromise = null;
    this.tileTextures.clear();
    for (const name of Object.keys(KENNEY_SHIP_SUBTEXTURES)) {
      if (Assets.cache.has(name)) {
        Assets.cache.remove(name);
      }
    }
  }
}
