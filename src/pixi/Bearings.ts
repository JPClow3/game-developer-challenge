import { bearingBounds } from './Camera';

export type BearingKind = 'chaser' | 'shooter';
type Edge = 'left' | 'right' | 'top' | 'bottom';
export interface Bearing {
  id: string;
  kind: BearingKind;
  x: number;
  y: number;
  rotation: number;
  distance: number;
}
export interface PlacedBearing extends Bearing {
  edge: Edge;
  count: number;
  sourceIds: string[];
}
const horizontal = (edge: Edge) => edge === 'top' || edge === 'bottom';
const coordinate = (bearing: PlacedBearing) => (horizontal(bearing.edge) ? bearing.x : bearing.y);

/** Group nearby enemies of the same type and keep their bearings clear of controls. */
export function placeBearings(bearings: Bearing[], width: number, height: number): PlacedBearing[] {
  const bounds = bearingBounds(width, height);
  const side = (bearing: Bearing): Edge => {
    const distances: [Edge, number][] = [
      ['left', Math.abs(bearing.x - bounds.left)],
      ['right', Math.abs(bearing.x - bounds.right)],
      ['top', Math.abs(bearing.y - bounds.top)],
      ['bottom', Math.abs(bearing.y - bounds.bottom)],
    ];
    return distances.sort((a, b) => a[1] - b[1])[0]![0];
  };
  const groups: PlacedBearing[] = [];
  const ordered = bearings
    .map((bearing) => ({ ...bearing, edge: side(bearing), count: 1, sourceIds: [bearing.id] }))
    .sort(
      (a, b) =>
        a.edge.localeCompare(b.edge) || coordinate(a) - coordinate(b) || a.id.localeCompare(b.id),
    );
  for (const bearing of ordered) {
    const group =
      bearing.kind === 'chaser' || bearing.kind === 'shooter'
        ? groups.find(
            (group) =>
              group.edge === bearing.edge &&
              group.kind === bearing.kind &&
              Math.abs(coordinate(group) - coordinate(bearing)) <= 48,
          )
        : undefined;
    if (!group) {
      groups.push(bearing);
      continue;
    }
    group.sourceIds.push(bearing.id);
    group.count++;
    if (
      bearing.distance < group.distance ||
      (bearing.distance === group.distance && bearing.id < group.id)
    ) {
      const { count, sourceIds } = group;
      Object.assign(group, bearing, { count, sourceIds });
    }
  }
  const placed: PlacedBearing[] = [];
  for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
    const edgeGroups = groups.filter((group) => group.edge === edge);
    const min = horizontal(edge) ? bounds.left : bounds.top;
    const max = horizontal(edge) ? bounds.right : bounds.bottom - 30;
    const gap = horizontal(edge) ? 80 : 44;
    const capacity = Math.max(1, Math.floor((max - min) / gap) + 1);
    // If a crowded edge exceeds its capacity, merge its closest same-type groups.
    while (edgeGroups.length > capacity) {
      let pair: [number, number] | undefined;
      let separation = Infinity;
      for (let i = 0; i < edgeGroups.length; i++)
        for (let j = i + 1; j < edgeGroups.length; j++) {
          const a = edgeGroups[i]!,
            b = edgeGroups[j]!;
          if (
            (a.kind === 'chaser' || a.kind === 'shooter') &&
            a.kind === b.kind &&
            Math.abs(coordinate(a) - coordinate(b)) < separation
          ) {
            pair = [i, j];
            separation = Math.abs(coordinate(a) - coordinate(b));
          }
        }
      if (!pair) break;
      const a = edgeGroups[pair[0]]!,
        b = edgeGroups[pair[1]]!;
      const nearest = a.distance <= b.distance ? a : b;
      edgeGroups[pair[0]] = {
        ...nearest,
        count: a.count + b.count,
        sourceIds: [...a.sourceIds, ...b.sourceIds],
      };
      edgeGroups.splice(pair[1], 1);
    }
    edgeGroups.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
    const used: number[] = [];
    for (const group of edgeGroups) {
      const desired = coordinate(group);
      const candidates = [desired, min, max, ...used.flatMap((value) => [value - gap, value + gap])]
        .filter(
          (value) =>
            value >= min &&
            value <= max &&
            used.every((other) => Math.abs(value - other) >= gap - 0.001),
        )
        .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b);
      const position = candidates[0];
      if (position === undefined) {
        // Greedy placement can leave unusable gaps. Uniformly space this
        // edge instead of hiding a threat; retained rotations still point at ships.
        for (const existing of placed.filter((bearing) => bearing.edge === edge))
          placed.splice(placed.indexOf(existing), 1);
        edgeGroups.sort((a, b) => coordinate(a) - coordinate(b) || a.id.localeCompare(b.id));
        edgeGroups.forEach((bearing, index) => {
          const value = min + ((max - min) * index) / Math.max(1, edgeGroups.length - 1);
          placed.push({ ...bearing, ...(horizontal(edge) ? { x: value } : { y: value }) });
        });
        break;
      }
      used.push(position);
      placed.push({ ...group, ...(horizontal(edge) ? { x: position } : { y: position }) });
    }
  }
  // Adjacent edges share a corner. Move the farther group along its edge.
  const move = (bearing: PlacedBearing) => {
    const min = horizontal(bearing.edge) ? bounds.left : bounds.top;
    const max = horizontal(bearing.edge) ? bounds.right : bounds.bottom - 30;
    const gap = horizontal(bearing.edge) ? 80 : 44;
    const desired = coordinate(bearing);
    const candidates = [desired, min, max];
    for (let offset = gap; offset <= max - min + gap; offset += gap)
      candidates.push(desired - offset, desired + offset);
    const position = candidates
      .filter((value) => value >= min && value <= max)
      .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired))
      .find((value) =>
        placed.every((other) => {
          if (other === bearing) return true;
          if (other.edge === bearing.edge)
            return Math.abs(value - coordinate(other)) >= gap - 0.001;
          const x = horizontal(bearing.edge) ? value : bearing.x;
          const y = horizontal(bearing.edge) ? bearing.y : value;
          return Math.hypot(x - other.x, y - other.y) >= 60;
        }),
      );
    if (position === undefined) return false;
    if (horizontal(bearing.edge)) bearing.x = position;
    else bearing.y = position;
    return true;
  };
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!,
        b = placed[j]!;
      if (a.edge === b.edge || Math.hypot(a.x - b.x, a.y - b.y) >= 60) continue;
      const first = a.distance > b.distance ? a : b;
      if (!move(first)) move(first === a ? b : a);
    }
  return placed;
}
