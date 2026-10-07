import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssetLoader,
  SOUND_MANIFEST,
  SHIP_DETERIORATION_MAP,
  KENNEY_SHIP_SUBTEXTURES,
  OPEN_WATER_TILE_ID,
  TOTAL_TILES_COUNT,
  UI_PANEL_BORDERS,
} from '@/assets/AssetLoader';

describe('AssetLoader & Kenney Visual Mappings', () => {
  beforeEach(() => {
    AssetLoader.getInstance().reset();
  });

  it('enforces singleton pattern', () => {
    const instanceA = AssetLoader.getInstance();
    const instanceB = AssetLoader.getInstance();
    expect(instanceA).toBe(instanceB);
  });

  describe('Damage Tier Calculation', () => {
    it('accurately calculates 4 Kenney damage deterioration stages based on health', () => {
      // Tier 1: 100% down to > 75%
      expect(AssetLoader.calculateDamageTier(100, 100)).toBe(1);
      expect(AssetLoader.calculateDamageTier(76, 100)).toBe(1);

      // Tier 2: 75% down to > 50%
      expect(AssetLoader.calculateDamageTier(75, 100)).toBe(2);
      expect(AssetLoader.calculateDamageTier(51, 100)).toBe(2);

      // Tier 3: 50% down to > 25%
      expect(AssetLoader.calculateDamageTier(50, 100)).toBe(3);
      expect(AssetLoader.calculateDamageTier(26, 100)).toBe(3);

      // Tier 4: <= 25%
      expect(AssetLoader.calculateDamageTier(25, 100)).toBe(4);
      expect(AssetLoader.calculateDamageTier(10, 100)).toBe(4);
      expect(AssetLoader.calculateDamageTier(0, 100)).toBe(4);
    });

    it('handles edge cases gracefully', () => {
      expect(AssetLoader.calculateDamageTier(-10, 100)).toBe(4);
      expect(AssetLoader.calculateDamageTier(0, 0)).toBe(4);
    });
  });

  describe('Entity Ship Faction & Frame Mapping', () => {
    it('maps entity types to their designated Kenney ship series', () => {
      expect(AssetLoader.getShipSeriesForEntity('player')).toBe(1); // Series 1 (White Sails)
      expect(AssetLoader.getShipSeriesForEntity('chaser')).toBe(2); // Series 2 (Corsair Black Sails)
      expect(AssetLoader.getShipSeriesForEntity('shooter')).toBe(3); // Series 3 (Crimson Red Sails)
    });

    it('maps Player Vessel (Series 1) across all 4 damage stages', () => {
      expect(AssetLoader.getShipFrameName(1, 1)).toBe('ship_1.png');
      expect(AssetLoader.getShipFrameName(1, 2)).toBe('ship_7.png');
      expect(AssetLoader.getShipFrameName(1, 3)).toBe('ship_13.png');
      expect(AssetLoader.getShipFrameName(1, 4)).toBe('ship_19.png');
    });

    it('maps Chaser Enemy (Series 2) across all 4 damage stages', () => {
      expect(AssetLoader.getShipFrameName(2, 1)).toBe('ship_2.png');
      expect(AssetLoader.getShipFrameName(2, 2)).toBe('ship_8.png');
      expect(AssetLoader.getShipFrameName(2, 3)).toBe('ship_14.png');
      expect(AssetLoader.getShipFrameName(2, 4)).toBe('ship_20.png');
    });

    it('maps Shooter Enemy (Series 3) across all 4 damage stages', () => {
      expect(AssetLoader.getShipFrameName(3, 1)).toBe('ship_3.png');
      expect(AssetLoader.getShipFrameName(3, 2)).toBe('ship_9.png');
      expect(AssetLoader.getShipFrameName(3, 3)).toBe('ship_15.png');
      expect(AssetLoader.getShipFrameName(3, 4)).toBe('ship_21.png');
    });

    it('contains all 24 Kenney ship mappings without omissions', () => {
      for (let s = 1; s <= 6; s++) {
        for (let t = 1; t <= 4; t++) {
          const frame = SHIP_DETERIORATION_MAP[s as keyof typeof SHIP_DETERIORATION_MAP][t as 1 | 2 | 3 | 4];
          expect(frame).toMatch(/^ship_\d+\.png$/);
          // Verify frame exists in KENNEY_SHIP_SUBTEXTURES with valid dimensions
          const sub = KENNEY_SHIP_SUBTEXTURES[frame];
          expect(sub).toBeDefined();
          expect(sub!.width).toBe(66);
          expect(sub!.height).toBe(113);
          expect(sub!.x).toBeGreaterThanOrEqual(0);
          expect(sub!.y).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('contains projectile and explosion VFX subtextures', () => {
      expect(KENNEY_SHIP_SUBTEXTURES['cannon_ball.png']).toBeDefined();
      expect(KENNEY_SHIP_SUBTEXTURES['explosion_1.png']).toBeDefined();
      expect(KENNEY_SHIP_SUBTEXTURES['explosion_2.png']).toBeDefined();
      expect(KENNEY_SHIP_SUBTEXTURES['explosion_3.png']).toBeDefined();
    });
  });

  describe('Tile Grid Coordinate Calculation', () => {
    it('maps 16x6 tile indices to precise column and row offsets', () => {
      expect(TOTAL_TILES_COUNT).toBe(96);

      // Tile 1: Top-Left (col 0, row 0)
      const t1 = AssetLoader.getTileCoordinate(1);
      expect(t1).toEqual({ col: 0, row: 0, x: 0, y: 0 });

      // Tile 16: Top-Right of first row (col 15, row 0)
      const t16 = AssetLoader.getTileCoordinate(16);
      expect(t16).toEqual({ col: 15, row: 0, x: 960, y: 0 });

      // Tile 17: Start of second row (col 0, row 1)
      const t17 = AssetLoader.getTileCoordinate(17);
      expect(t17).toEqual({ col: 0, row: 1, x: 0, y: 64 });

      // Tile 73: Open sea water (Row 4, Col 8)
      expect(OPEN_WATER_TILE_ID).toBe(73);
      const t73 = AssetLoader.getTileCoordinate(73);
      expect(t73).toEqual({ col: 8, row: 4, x: 512, y: 256 });

      // Tile 96: Bottom-Right tile
      const t96 = AssetLoader.getTileCoordinate(96);
      expect(t96).toEqual({ col: 15, row: 5, x: 960, y: 320 });
    });
  });

  describe('Sound Manifest Catalog', () => {
    it('contains exactly 27 audio files according to assets_spec.md', () => {
      const soundKeys = Object.keys(SOUND_MANIFEST);
      expect(soundKeys).toHaveLength(27);
    });

    it('identifies looping ambient audio tracks', () => {
      expect(SOUND_MANIFEST.ocean_ambience_loop.loop).toBe(true);
      expect(SOUND_MANIFEST.ocean_ambience_loop.channels).toBe(2);

      expect(SOUND_MANIFEST.ship_sailing_loop.loop).toBe(true);
      expect(SOUND_MANIFEST.ship_sailing_loop.channels).toBe(2);
    });

    it('defines valid volumes within [0.0, 1.0] for all SFX', () => {
      for (const [, entry] of Object.entries(SOUND_MANIFEST)) {
        expect(entry.defaultVolume).toBeGreaterThan(0);
        expect(entry.defaultVolume).toBeLessThanOrEqual(1);
        expect(entry.filename.endsWith('.wav')).toBe(true);
      }
    });
  });

  describe('UI Panel Layout Metadata', () => {
    it('defines 9-slice borders for panel_menu', () => {
      expect(UI_PANEL_BORDERS.left).toBe(32);
      expect(UI_PANEL_BORDERS.top).toBe(40);
      expect(UI_PANEL_BORDERS.right).toBe(32);
      expect(UI_PANEL_BORDERS.bottom).toBe(40);
    });
  });

  describe('Promise Caching & Double Mount Safety', () => {
    it('caches the loading promise and returns the same promise for concurrent calls', async () => {
      const loader = AssetLoader.getInstance();
      const p1 = loader.preload();
      const p2 = loader.preload();
      expect(p1).toBe(p2);
      await p1;
      expect(loader.isReady()).toBe(true);
    });
  });
});
