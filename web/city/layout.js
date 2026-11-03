/**
 * Town geometry: isometric projection, where buildings stand, and how agents walk.
 *
 * Every town uses the same plan, SimCity-style: a road grid every four tiles,
 * civic buildings in the corners, a Kafra booth in the middle plaza and up to
 * eight district buildings (one per top-level folder of the repo) between them.
 * A fixed plan means an agent's position alone tells you what it is doing.
 */

export const TW = 32;           // tile width in px
export const TH = 16;           // tile height in px
export const SIZE = 21;         // tiles per town edge
export const TOWN_GAP = 11;     // tiles of wilderness between towns
export const TOWNS_PER_ROW = 3;

export const ROADS = [4, 8, 12, 16];

/** Tile → screen, relative to the town's north corner. */
export function iso(x, y) {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) };
}

/** World tile offset of the i-th town. Laid out diagonally-aligned rows so towns read as a map. */
export function townOrigin(i) {
  const step = SIZE + TOWN_GAP;
  return { x: (i % TOWNS_PER_ROW) * step, y: Math.floor(i / TOWNS_PER_ROW) * step };
}

/** Eight building slots on the road lattice, 2×2 footprints, centred on these tiles. */
export const DISTRICT_SLOTS = [
  [6, 6], [10, 6], [14, 6],
  [6, 10], [14, 10],
  [6, 14], [10, 14], [14, 14],
];

export const CIVIC = {
  // Signboard text comes from i18n (`civic.<key>`).
  library: { x: 2, y: 2 },
  workshop: { x: 18, y: 2 },
  inn: { x: 2, y: 18 },
  arena: { x: 18, y: 18 },
  kafra: { x: 10, y: 10 },
  warp: { x: 12, y: 12 },
};

/**
 * Where an agent stands for each kind of work. Lists, because several agents
 * doing the same thing should queue up rather than stack on one tile.
 */
const SPOTS = {
  research: [[3, 4], [2, 4], [4, 3], [4, 2]],
  craft: [[17, 4], [18, 4], [16, 3], [16, 2]],
  trial: [[16, 18], [16, 17], [16, 19], [17, 16]],
  deliver: [[11, 12], [10, 12], [9, 12]],
  teleport: [[12, 12]],
  resting: [[4, 18], [4, 17], [4, 19], [3, 16]],
  idle: [[7, 12], [13, 12], [4, 10], [16, 10], [10, 4], [10, 16]],
  waiting: [[8, 7], [12, 7], [8, 13], [12, 13], [7, 8], [13, 8], [7, 4], [13, 16]],
  cast: [[8, 12], [12, 8], [8, 8], [12, 12]],
};
SPOTS.ask = SPOTS.waiting;

/** Kinds that happen wherever the agent already is: thinking and summoning don't need a building. */
const IN_PLACE = new Set(['cast', 'summon']);

/**
 * Standing tile for an agent: beside its district building, or at a civic spot.
 * Null means stay put — unless the agent has nowhere yet (`placed` false).
 */
export function spotFor(kind, buildingIndex, queue, placed = true) {
  if (IN_PLACE.has(kind) && placed) return null;
  if (kind === 'build' && buildingIndex >= 0) {
    const [bx, by] = DISTRICT_SLOTS[buildingIndex];
    // East road of the building, spread along it.
    const offsets = [0, -1, 1, 0.5, -0.5];
    return { x: bx + 2, y: by + offsets[queue % offsets.length] };
  }
  const list = SPOTS[kind] ?? SPOTS.cast;
  const [x, y] = list[queue % list.length];
  const lap = Math.floor(queue / list.length);
  return { x: x + lap * 0.35, y: y + lap * 0.35 };
}

const onRoad = (v) => ROADS.some((r) => Math.abs(r - v) < 0.6);
const nearestRoad = (v) => ROADS.reduce((a, r) => (Math.abs(r - v) < Math.abs(a - v) ? r : a), ROADS[0]);

/**
 * Waypoints from a to b along the road grid, so nobody walks through a wall.
 * Every spot above lies on a road, which keeps this to a few cases.
 */
export function route(a, b) {
  const aRow = onRoad(a.y), aCol = onRoad(a.x);
  const bRow = onRoad(b.y), bCol = onRoad(b.x);
  if (aRow && bRow) {
    if (Math.abs(a.y - b.y) < 0.6) return [b];
    const c = nearestRoad((a.x + b.x) / 2);
    return [{ x: c, y: a.y }, { x: c, y: b.y }, b];
  }
  if (aRow && bCol) return [{ x: b.x, y: a.y }, b];
  if (aCol && bRow) return [{ x: a.x, y: b.y }, b];
  if (aCol && bCol) {
    if (Math.abs(a.x - b.x) < 0.6) return [b];
    const r = nearestRoad((a.y + b.y) / 2);
    return [{ x: a.x, y: r }, { x: b.x, y: r }, b];
  }
  return [b];
}
