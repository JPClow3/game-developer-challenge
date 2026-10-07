import { describe, it, expect } from 'vitest';
import {
  ShipKinematics,
  createKinematicState,
  wrapAngle,
  lerpAngle,
  getForwardVector,
  getRightVector,
  getLeftVector,
} from '../../../src/core/kinematics/ShipKinematics';
import { DEFAULT_PLAYER_MOVEMENT, DEFAULT_ARENA_CONFIG } from '../../../src/types';

describe('ShipKinematics Subsystem', () => {
  it('creates clean initial kinematic state with wrapped angle', () => {
    const state = createKinematicState(100, 200, Math.PI * 3);
    expect(state.x).toBe(100);
    expect(state.y).toBe(200);
    expect(state.prevX).toBe(100);
    expect(state.prevY).toBe(200);
    expect(state.velocityX).toBe(0);
    expect(state.velocityY).toBe(0);
    // 3*PI wraps to PI
    expect(Math.abs(wrapAngle(state.rotation - Math.PI))).toBeLessThan(1e-5);
  });

  it('computes correct directional unit vectors for cardinal directions', () => {
    // 0 rad = North (0, -1)
    const fNorth = getForwardVector(0);
    expect(fNorth.x).toBeCloseTo(0, 5);
    expect(fNorth.y).toBeCloseTo(-1, 5);

    const rNorth = getRightVector(0);
    expect(rNorth.x).toBeCloseTo(1, 5);
    expect(rNorth.y).toBeCloseTo(0, 5);

    const lNorth = getLeftVector(0);
    expect(lNorth.x).toBeCloseTo(-1, 5);
    expect(lNorth.y).toBeCloseTo(0, 5);

    // PI/2 rad = East (1, 0)
    const fEast = getForwardVector(Math.PI / 2);
    expect(fEast.x).toBeCloseTo(1, 5);
    expect(fEast.y).toBeCloseTo(0, 5);
  });

  it('correctly wraps angles to [-PI, PI]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 5);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(-Math.PI, 5);
    expect(wrapAngle(Math.PI * 2)).toBeCloseTo(0, 5);
    expect(wrapAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI * 0.5, 5);
    expect(wrapAngle(-Math.PI * 2.5)).toBeCloseTo(-Math.PI * 0.5, 5);
  });

  it('computes shortest-arc lerpAngle interpolation', () => {
    // Interpolating from near PI to near -PI (boundary wrap)
    const angleA = Math.PI - 0.1;
    const angleB = -Math.PI + 0.1;
    const mid = lerpAngle(angleA, angleB, 0.5);
    expect(Math.abs(mid)).toBeCloseTo(Math.PI, 2);
  });

  it('accelerates forward along heading when throttle is applied', () => {
    // Facing North (0 rad), forward is (0, -1)
    const state = createKinematicState(500, 500, 0);
    const dt = 1 / 60;

    ShipKinematics.step(state, { throttle: 1, steer: 0 }, DEFAULT_PLAYER_MOVEMENT, dt);

    expect(state.velocityY).toBeLessThan(0); // Moving North (negative Y)
    expect(state.velocityX).toBeCloseTo(0, 5); // No lateral movement
    expect(state.y).toBeLessThan(500); // Position advanced
    expect(state.prevY).toBe(500); // Recorded previous position
  });

  it('applies bilateral steering left (-1) and right (+1)', () => {
    const dt = 0.1;
    const stateLeft = createKinematicState(500, 500, 0);
    ShipKinematics.step(stateLeft, { throttle: 0, steer: -1 }, DEFAULT_PLAYER_MOVEMENT, dt);
    expect(stateLeft.rotation).toBeLessThan(0); // Counter-clockwise turn

    const stateRight = createKinematicState(500, 500, 0);
    ShipKinematics.step(stateRight, { throttle: 0, steer: 1 }, DEFAULT_PLAYER_MOVEMENT, dt);
    expect(stateRight.rotation).toBeGreaterThan(0); // Clockwise turn
  });

  it('damps lateral velocity much faster than longitudinal velocity due to keel drag (c_lat=5.5 vs c_long=0.95)', () => {
    // Facing North: forward is Y, lateral is X
    const state = createKinematicState(500, 500, 0);
    state.velocityX = 100; // 100 px/s lateral drift (sideways)
    state.velocityY = -100; // 100 px/s forward speed (longitudinal)

    const dt = 1 / 60;
    // Step with zero throttle
    ShipKinematics.step(state, { throttle: 0, steer: 0 }, DEFAULT_PLAYER_MOVEMENT, dt);

    const lateralDamping = state.velocityX / 100;
    const longitudinalDamping = Math.abs(state.velocityY) / 100;

    // Keel lateral drag is 5.5 s^-1 vs longitudinal 0.95 s^-1
    // Lateral velocity should have decayed significantly more than forward velocity!
    expect(lateralDamping).toBeLessThan(longitudinalDamping);
    expect(lateralDamping).toBeCloseTo(1 - DEFAULT_PLAYER_MOVEMENT.lateralDrag * dt, 4);
    expect(longitudinalDamping).toBeCloseTo(1 - DEFAULT_PLAYER_MOVEMENT.longitudinalDrag * dt, 4);
  });

  it('clamps forward velocity to maxForwardSpeed', () => {
    const state = createKinematicState(500, 500, 0);
    // Artificially impose velocity exceeding maxForwardSpeed (220)
    state.velocityY = -300;

    ShipKinematics.step(state, { throttle: 1, steer: 0 }, DEFAULT_PLAYER_MOVEMENT, 1 / 60);

    const currentSpeed = Math.hypot(state.velocityX, state.velocityY);
    expect(currentSpeed).toBeLessThanOrEqual(DEFAULT_PLAYER_MOVEMENT.maxForwardSpeed + 0.01);
    expect(currentSpeed).toBeCloseTo(DEFAULT_PLAYER_MOVEMENT.maxForwardSpeed, 1);
  });

  it('clamps position to arena boundaries and zeroes outbound velocity', () => {
    const arena = DEFAULT_ARENA_CONFIG; // width: 1600, height: 1000, margin: 40
    const state = createKinematicState(arena.margin + 5, 500, -Math.PI / 2); // Facing West (left)
    state.velocityX = -100;

    // Step moving further left
    ShipKinematics.step(state, { throttle: 1, steer: 0 }, DEFAULT_PLAYER_MOVEMENT, 0.2, arena);

    expect(state.x).toBeGreaterThanOrEqual(arena.margin);
    expect(state.velocityX).toBeGreaterThanOrEqual(0); // Outward negative velocity cancelled
  });

  it('ignores invalid dt values <= 0', () => {
    const state = createKinematicState(500, 500, 0);
    ShipKinematics.step(state, { throttle: 1, steer: 1 }, DEFAULT_PLAYER_MOVEMENT, 0);
    expect(state.x).toBe(500);
    expect(state.y).toBe(500);
    expect(state.rotation).toBe(0);
  });
});
