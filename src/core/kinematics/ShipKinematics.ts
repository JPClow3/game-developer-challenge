import type { KinematicState, ShipPhysicsConfig, Vector2D, ArenaBounds } from '../../types';

export interface MovementInput {
  throttle: number; // 0 (neutral) to 1.0 (full ahead)
  steer: number;    // -1.0 (steer left/port) to 1.0 (steer right/starboard)
}

/**
 * Standard mathematical angle wrapping to [-PI, PI].
 */
export function wrapAngle(radians: number): number {
  return Math.atan2(Math.sin(radians), Math.cos(radians));
}

/**
 * Shortest-arc angular interpolation between two angles in radians.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = wrapAngle(b - a);
  return wrapAngle(a + diff * t);
}

/**
 * Forward unit vector for heading theta (0 = North/Up, clockwise positive).
 * fx = sin(theta), fy = -cos(theta)
 */
export function getForwardVector(rotation: number): Vector2D {
  return {
    x: Math.sin(rotation),
    y: -Math.cos(rotation),
  };
}

/**
 * Right (starboard) unit normal vector for heading theta.
 * rx = cos(theta), ry = sin(theta)
 */
export function getRightVector(rotation: number): Vector2D {
  return {
    x: Math.cos(rotation),
    y: Math.sin(rotation),
  };
}

/**
 * Left (port) unit normal vector for heading theta.
 * lx = -cos(theta), ly = -sin(theta)
 */
export function getLeftVector(rotation: number): Vector2D {
  return {
    x: -Math.cos(rotation),
    y: -Math.sin(rotation),
  };
}

/**
 * Creates a clean default KinematicState.
 */
export function createKinematicState(x: number, y: number, rotation: number = 0): KinematicState {
  return {
    x,
    y,
    prevX: x,
    prevY: y,
    rotation: wrapAngle(rotation),
    prevRotation: wrapAngle(rotation),
    velocityX: 0,
    velocityY: 0,
    angularVelocity: 0,
  };
}

/**
 * ShipKinematics engine.
 * Computes forward acceleration, bilateral steering, keel lateral drag damping (c_lateral = 5.5),
 * longitudinal drag damping (0.95), and arena boundary clamping.
 */
export class ShipKinematics {
  /**
   * Advances kinematic state by dt seconds given control inputs and physics configuration.
   */
  public static step(
    state: KinematicState,
    input: MovementInput,
    config: ShipPhysicsConfig,
    dt: number,
    arena?: ArenaBounds
  ): void {
    if (dt <= 0) return;

    // 1. Record previous transforms for render interpolation (alpha)
    state.prevX = state.x;
    state.prevY = state.y;
    state.prevRotation = state.rotation;

    // 2. Angular Update (Bilateral Steering)
    // steerInput is clamped to [-1, 1]
    const steerClamped = Math.max(-1, Math.min(1, input.steer));
    state.angularVelocity = steerClamped * config.turnRate;
    state.rotation = wrapAngle(state.rotation + state.angularVelocity * dt);

    // 3. Decompose Velocity along Keel (forward) and Beam (lateral)
    const f = getForwardVector(state.rotation);
    const r = getRightVector(state.rotation);

    let forwardSpeed = state.velocityX * f.x + state.velocityY * f.y;
    let lateralSpeed = state.velocityX * r.x + state.velocityY * r.y;

    // 4. Apply Forward Acceleration (Thrust)
    const throttleClamped = Math.max(0, Math.min(1, input.throttle));
    if (throttleClamped > 0) {
      forwardSpeed += throttleClamped * config.acceleration * dt;
    }

    // 5. Apply Hydrodynamic Keel Damping
    // Longitudinal drag (gradual slowdown upon releasing throttle)
    const longDampingFactor = Math.max(0, 1 - config.longitudinalDrag * dt);
    forwardSpeed *= longDampingFactor;

    // Lateral drag (strong keel resistance against sideways drift / ice-skating)
    const latDampingFactor = Math.max(0, 1 - config.lateralDrag * dt);
    lateralSpeed *= latDampingFactor;

    // 6. Velocity Clamping
    if (!config.reverseAllowed && forwardSpeed < 0) {
      forwardSpeed = 0;
    }
    if (forwardSpeed > config.maxForwardSpeed) {
      forwardSpeed = config.maxForwardSpeed;
    }

    // 7. Reconstruct World Velocity
    state.velocityX = f.x * forwardSpeed + r.x * lateralSpeed;
    state.velocityY = f.y * forwardSpeed + r.y * lateralSpeed;

    // 8. Integrate Position
    state.x += state.velocityX * dt;
    state.y += state.velocityY * dt;

    // 9. Boundary Clamping if arena bounds are defined
    if (arena) {
      this.clampToBounds(state, arena);
    }
  }

  /**
   * Clamps ship position to arena bounds and nullifies outbound velocity components.
   */
  public static clampToBounds(state: KinematicState, arena: ArenaBounds, customMargin?: number): void {
    const margin = customMargin !== undefined ? customMargin : arena.margin;
    const minX = margin;
    const maxX = arena.width - margin;
    const minY = margin;
    const maxY = arena.height - margin;

    if (state.x < minX) {
      state.x = minX;
      state.velocityX = Math.max(0, state.velocityX);
    } else if (state.x > maxX) {
      state.x = maxX;
      state.velocityX = Math.min(0, state.velocityX);
    }

    if (state.y < minY) {
      state.y = minY;
      state.velocityY = Math.max(0, state.velocityY);
    } else if (state.y > maxY) {
      state.y = maxY;
      state.velocityY = Math.min(0, state.velocityY);
    }
  }
}
