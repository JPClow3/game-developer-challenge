import type { KinematicState, ArenaBounds } from '../types';
import { wrapAngle } from '../core/kinematics/ShipKinematics';

export function interpolateTransform(k: KinematicState, alpha: number) {
  const t = Math.max(0, Math.min(1, alpha));
  return { x: k.prevX + (k.x - k.prevX) * t, y: k.prevY + (k.y - k.prevY) * t,
    rotation: k.prevRotation + wrapAngle(k.rotation - k.prevRotation) * t };
}

export function combatCamera(width: number, height: number, arena: ArenaBounds, player: {x:number;y:number}) {
  const portrait = width < height && width < 768;
  const scale = portrait ? Math.max(width / 560, height / arena.height) : Math.min(width / arena.width, height / arena.height);
  const clamp = (value: number, size: number, span: number) => Math.max(Math.min(0, size - span), Math.min(Math.max(0, size - span), value));
  // Allow sea beyond the vertical arena edge so the hull stays clear of DOM
  // status and touch controls even when the ship reaches the world boundary.
  const topInset = Math.min(128, height * .2);
  const bottomInset = Math.min(175, height * .27);
  return { scale, portrait,
    x: portrait ? clamp(width / 2 - player.x * scale, width, arena.width * scale) : (width - arena.width * scale) / 2,
    y: portrait ? Math.max(height - bottomInset - arena.height * scale, Math.min(topInset, height * .53 - player.y * scale)) : (height - arena.height * scale) / 2 };
}

/** Keep edge bearings inside the combat HUD and touch controls. */
export function bearingBounds(width: number, height: number) {
  return {left:24,right:width-24,top:Math.min(170,height*.27),bottom:height-Math.min(175,height*.27)};
}

/** Intersect bearing from the visible player with an inset screen rectangle. */
export function edgeIndicator(player: {x:number;y:number}, enemy: {x:number;y:number}, width: number, height: number) {
  const {left,right,top,bottom} = bearingBounds(width,height);
  if (enemy.x >= left && enemy.x <= right && enemy.y >= top && enemy.y <= bottom) return null;
  const origin = {x:Math.max(left,Math.min(right,player.x)),y:Math.max(top,Math.min(bottom,player.y))};
  const dx = enemy.x - origin.x, dy = enemy.y - origin.y;
  const t = Math.min(dx > 0 ? (right-origin.x)/dx : dx < 0 ? (left-origin.x)/dx : Infinity,
    dy > 0 ? (bottom-origin.y)/dy : dy < 0 ? (top-origin.y)/dy : Infinity);
  return {x:origin.x+dx*t,y:origin.y+dy*t,rotation:Math.atan2(dy,dx)};
}
