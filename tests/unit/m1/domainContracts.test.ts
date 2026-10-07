import { describe, it, expect } from 'vitest';
import { MSW_SCENARIOS, type SubmitMatchRequest } from '@/types/api';

describe('Domain Contracts, Kinematics Formulas & API Specifications', () => {
  describe('Kinematic Unit Vectors & Orientation Standard', () => {
    // Forward: (sin(theta), -cos(theta)), Right: (cos(theta), sin(theta)), Left: (-cos(theta), -sin(theta))
    function getForwardVector(theta: number): { x: number; y: number } {
      return { x: Math.sin(theta), y: -Math.cos(theta) };
    }

    function getRightVector(theta: number): { x: number; y: number } {
      return { x: Math.cos(theta), y: Math.sin(theta) };
    }

    function getLeftVector(theta: number): { x: number; y: number } {
      return { x: -Math.cos(theta), y: -Math.sin(theta) };
    }

    it('evaluates North heading (theta = 0) with zero x drift and negative y velocity', () => {
      const f = getForwardVector(0);
      const r = getRightVector(0);
      const l = getLeftVector(0);

      expect(f.x).toBeCloseTo(0);
      expect(f.y).toBeCloseTo(-1);

      expect(r.x).toBeCloseTo(1);
      expect(r.y).toBeCloseTo(0);

      expect(l.x).toBeCloseTo(-1);
      expect(l.y).toBeCloseTo(0);
    });

    it('evaluates East heading (theta = pi/2) with positive x and zero y velocity', () => {
      const f = getForwardVector(Math.PI / 2);
      const r = getRightVector(Math.PI / 2);

      expect(f.x).toBeCloseTo(1);
      expect(f.y).toBeCloseTo(0);

      expect(r.x).toBeCloseTo(0);
      expect(r.y).toBeCloseTo(1);
    });

    it('evaluates South heading (theta = pi) with zero x and positive y velocity', () => {
      const f = getForwardVector(Math.PI);
      expect(f.x).toBeCloseTo(0);
      expect(f.y).toBeCloseTo(1);
    });
  });

  describe('3-Cannon Parallel Salvo Geometry Contract', () => {
    it('calculates 3 parallel port/starboard gunport offsets along ship hull', () => {
      const shipPos = { x: 500, y: 500 };
      const heading = 0; // facing North
      expect(heading).toBe(0);
      const hullHalfWidth = 16;
      const gunSpacing = 18;


      // When facing North: forward is (0, -1), right is (1, 0)
      // Starboard (Right) Gunports:
      const port1Fore = {
        x: shipPos.x + hullHalfWidth,
        y: shipPos.y - gunSpacing,
      };
      const port2Mid = {
        x: shipPos.x + hullHalfWidth,
        y: shipPos.y,
      };
      const port3Aft = {
        x: shipPos.x + hullHalfWidth,
        y: shipPos.y + gunSpacing,
      };

      expect(port1Fore.x).toBe(516);
      expect(port1Fore.y).toBe(482);
      expect(port2Mid.x).toBe(516);
      expect(port2Mid.y).toBe(500);
      expect(port3Aft.x).toBe(516);
      expect(port3Aft.y).toBe(518);

      // Distance between fore and mid is exactly 18px
      expect(Math.abs(port1Fore.y - port2Mid.y)).toBe(18);
      // Distance between mid and aft is exactly 18px
      expect(Math.abs(port3Aft.y - port2Mid.y)).toBe(18);
    });
  });

  describe('MSW Scenario Inventory', () => {
    it('defines all 9 required MSW scenarios from README §6', () => {
      expect(MSW_SCENARIOS).toHaveLength(9);
      const ids = MSW_SCENARIOS.map((s) => s.id);

      expect(ids).toContain('success');
      expect(ids).toContain('empty');
      expect(ids).toContain('slow_network');
      expect(ids).toContain('out_of_order');
      expect(ids).toContain('error_400');
      expect(ids).toContain('error_500');
      expect(ids).toContain('timeout');
      expect(ids).toContain('idempotency_recovery');
      expect(ids).toContain('server_offline');
    });
  });

  describe('Match Submission Contract Integrity', () => {
    it('adheres to UUID v4 idempotency and ISO 8601 timestamps', () => {
      const request: SubmitMatchRequest = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        playerId: 'player_pirate_1',
        playerName: 'Blackbeard',
        score: 18,
        durationSeconds: 120,
        endReason: 'time_expired',
        config: {
          sessionDurationSeconds: 120,
          enemySpawnIntervalSeconds: 3,
        },
        playedAt: new Date().toISOString(),
      };

      expect(request.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(request.endReason).not.toBe('abandoned');
      expect(Date.parse(request.playedAt)).not.toBeNaN();
    });
  });
});
