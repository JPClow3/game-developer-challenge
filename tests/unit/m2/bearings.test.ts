import { expect, it } from 'vitest';
import { bearingBounds } from '../../../src/pixi/Camera';
import { placeBearings, type Bearing } from '../../../src/pixi/Bearings';

function packed(width: number, height: number): Bearing[] {
  const bounds = bearingBounds(width, height);
  const center = (bounds.top + bounds.bottom) / 2;
  return Array.from({ length: 8 }, (_, index) => ({
    id: `enemy-${index}`,
    kind: index % 2 ? 'shooter' : 'chaser',
    x: bounds.right,
    y: center + index * 3,
    rotation: index * 0.02,
    distance: 500 + index,
  }));
}

it.each([
  [393, 851],
  [320, 568],
])('separates crowded bearings at %ix%i and preserves every enemy', (width, height) => {
  const original = packed(width, height);
  const untouched = structuredClone(original);
  const placed = placeBearings(original, width, height);
  expect(placed).toHaveLength(2);
  expect(placed.find((bearing) => bearing.kind === 'chaser')!.count).toBe(4);
  expect(placed.find((bearing) => bearing.kind === 'shooter')!.count).toBe(4);
  expect(placed.flatMap((bearing) => bearing.sourceIds).sort()).toEqual(
    original.map((bearing) => bearing.id).sort(),
  );
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      expect(Math.abs(placed[i]!.y - placed[j]!.y)).toBeGreaterThanOrEqual(43.999);
    }
  for (const bearing of placed) {
    const nearest = original
      .filter((entry) => bearing.sourceIds.includes(entry.id))
      .sort((a, b) => a.distance - b.distance)[0]!;
    expect(bearing.distance).toBe(nearest.distance);
    expect(bearing.rotation).toBe(nearest.rotation);
    expect(bearing.y + 30).toBeLessThanOrEqual(bearingBounds(width, height).bottom);
  }
  expect(original).toEqual(untouched);
  expect(placeBearings([...original].reverse(), width, height)).toEqual(placed);
});

it('merges same-type groups under edge capacity pressure without hiding enemies', () => {
  const width = 320,
    height = 568,
    bounds = bearingBounds(width, height);
  const sources = Array.from({ length: 8 }, (_, index): Bearing => ({
    id: `enemy-${index}`,
    kind: index % 2 ? 'shooter' : 'chaser',
    x: bounds.right,
    y: bounds.top + (index * (bounds.bottom - bounds.top)) / 7,
    rotation: 0.02 * index,
    distance: 100 + index,
  }));
  const placed = placeBearings(sources, width, height);
  expect(placed.length).toBeLessThanOrEqual(6);
  expect(placed.flatMap((bearing) => bearing.sourceIds).sort()).toEqual(
    sources.map((bearing) => bearing.id).sort(),
  );
  const ordered = placed.sort((a, b) => a.y - b.y);
  for (let index = 1; index < ordered.length; index++)
    expect(ordered[index]!.y - ordered[index - 1]!.y).toBeGreaterThanOrEqual(43.999);
});

it('keeps well-separated directions and different edges independent', () => {
  const sources: Bearing[] = [
    { id: 'left', kind: 'chaser', x: 24, y: 300, rotation: Math.PI, distance: 400 },
    { id: 'right', kind: 'chaser', x: 369, y: 300, rotation: 0, distance: 400 },
    { id: 'top', kind: 'shooter', x: 190, y: 170, rotation: -Math.PI / 2, distance: 500 },
  ];
  const placed = placeBearings(sources, 393, 851);
  expect(placed).toHaveLength(3);
  for (const source of sources)
    expect(placed.find((bearing) => bearing.id === source.id)).toMatchObject(source);
  expect(placeBearings([], 393, 851)).toEqual([]);
});

it('separates bearings sharing a corner and preserves the nearer shooter before moving a chaser', () => {
  const sources: Bearing[] = [
    { id: 'chaser', kind: 'chaser', x: 24, y: 175, rotation: -2, distance: 800 },
    { id: 'shooter', kind: 'shooter', x: 30, y: 170, rotation: -2.1, distance: 700 },
  ];
  const placed = placeBearings(sources, 393, 851);
  const shooter = placed.find((bearing) => bearing.id === 'shooter')!,
    chaser = placed.find((bearing) => bearing.id === 'chaser')!;
  expect(shooter.x).toBe(30);
  expect(shooter.y).toBe(170);
  expect(Math.hypot(shooter.x - chaser.x, shooter.y - chaser.y)).toBeGreaterThanOrEqual(60);
  expect(chaser.edge).toBe('left');
  expect(chaser.rotation).toBe(-2);
});
