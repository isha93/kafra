/**
 * Scenery: trees, lamps, flowers and small parks on empty lots.
 *
 * Placement is seeded by the town id, so a town keeps the same trees across
 * reloads and two towns never look copy-pasted.
 */
import { Container, Sprite } from '/vendor/pixi.mjs';
import * as drawn from './art.js';
import { decorArt } from './assets.js';
import { lookOf } from './land.js';
import { SIZE, ROADS, DISTRICT_SLOTS, CIVIC } from './layout.js';

/**
 * A decoration from web/assets when there is one, else the drawn version.
 * `v` (0–1) varies size and tint so one tree image still makes a varied forest.
 */
function make(name, v = 0.5) {
  const art = decorArt.get(name);
  // Biome trees without art fall back to the drawn oak; a campfire without art is skipped.
  if (!art) return drawn[name] ? drawn[name](v) : name === 'campfire' ? null : drawn.tree(v);
  const s = new Sprite(art.texture);
  s.anchor.set(art.anchor[0], art.anchor[1]);
  s.scale.set(art.scale * (0.85 + v * 0.3));
  if (name === 'tree') s.tint = [0xffffff, 0xe8f4e0, 0xf4f0d8][Math.floor(v * 3) % 3];
  return s;
}
const lamp = () => make('lamp');
const flowers = (v) => make('flowers', v);
const bench = () => make('bench');

/** Small deterministic PRNG (mulberry32). */
export function seeded(text) {
  let a = 0;
  for (const c of text) a = (Math.imul(a ^ c.charCodeAt(0), 2654435761) + 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CIVIC_FOOTPRINTS = ['library', 'workshop', 'inn', 'arena'].map((k) => CIVIC[k]);

function isRoad(x, y) {
  const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
  return !edge && (ROADS.includes(x) || ROADS.includes(y));
}

function inPlaza(x, y) { return x >= 9 && x <= 11 && y >= 9 && y <= 11; }

function underCivic(x, y) {
  return CIVIC_FOOTPRINTS.some((c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1)
    // The workshop's anvil sits just west of it.
    || (x === 16 && y === 3);
}

function slotOf(x, y) {
  return DISTRICT_SLOTS.findIndex(([bx, by]) => Math.abs(bx - x) <= 1 && Math.abs(by - y) <= 1);
}

/**
 * Build all scenery for a town.
 *
 * `put(obj, x, y)` adds a depth-sorted object. Returns lamp tiles (for night
 * glow) and one container per district slot, shown only while the slot is an
 * empty lot.
 */
export function decorate(id, put, { biome, tier, mood } = {}) {
  const rand = seeded(id);
  const lamps = [];
  const parks = DISTRICT_SLOTS.map(() => new Container());
  const look = lookOf(biome);
  const tree = (v) => make(look.trees[Math.floor(v * 7) % look.trees.length], v);
  // An abandoned town is being taken back by the woods, and nobody tends the flowers.
  const wild = mood === 'abandoned' ? 0.12 : 0;
  const edgeTrees = Math.min(0.85, 0.4 * look.density + wild);
  const innerTrees = 0.08 * look.density + wild;
  const flowerChance = mood === 'abandoned' ? 0 : 0.08 * look.flowers;

  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      if (isRoad(x, y) || inPlaza(x, y) || underCivic(x, y)) continue;
      const slot = slotOf(x, y);
      const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
      const r = rand();
      if (slot >= 0) {
        // Empty lot: a little park, hidden once a building moves in.
        const [bx, by] = DISTRICT_SLOTS[slot];
        const centre = x === bx && y === by;
        const obj = centre ? (tier?.id === 'camp' ? null : bench()) : r < 0.3 * look.density ? tree(rand()) : r < 0.3 + 0.45 * look.flowers / 2.5 ? flowers(rand()) : null;
        if (obj) parks[slot].addChild(placeIn(obj, x - bx, y - by));
        continue;
      }
      // Dense at the town edge, sparse inside so trees never hide an agent.
      if (edge ? r < edgeTrees : r < innerTrees) put(tree(rand()), x + (rand() - 0.5) * 0.3, y + (rand() - 0.5) * 0.3);
      else if (r < innerTrees + flowerChance && look.flowers) put(flowers(rand()), x, y, -8);
    }
  }

  // Lamps on the inner crossroads around the plaza and the outer corners; every
  // crossroads would be sixteen posts, which reads as a fence.
  // Camps have no street lighting, villages light the plaza, towns light the corners too.
  const posts = tier?.id === 'camp' ? [] : tier?.id === 'village' ? [[8, 8], [8, 12], [12, 8], [12, 12]]
    : [[8, 8], [8, 12], [12, 8], [12, 12], [4, 4], [4, 16], [16, 4], [16, 16]];
  for (const [rx, ry] of posts) {
    const at = { x: rx + 0.42, y: ry + 0.42 };
    put(lamp(), at.x, at.y);
    lamps.push(at);
  }
  // A camp gathers round a fire in the plaza; it doubles as the only light.
  if (tier?.id === 'camp') {
    const fire = make('campfire');
    if (fire) put(fire, 11.4, 9.0);
    lamps.push({ x: 11.4, y: 9.0 });
  }
  return { lamps, parks };
}

/** Position a park object relative to its slot centre (the park container sits at the centre). */
function placeIn(obj, dx, dy) {
  obj.position.set((dx - dy) * 16, (dx + dy) * 8);
  obj.zIndex = (dx + dy) * 8;
  return obj;
}
