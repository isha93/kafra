/**
 * The land a town stands on: ground by biome, walls by tier, water at the coast.
 *
 * The server decides tier, biome and mood (src/growth.mjs); this only draws
 * them. Everything here is drawn once per town and rebuilt if any of the three
 * changes, which in practice is rare.
 */
import { Container, Graphics, FillPattern, Matrix } from '/vendor/pixi.mjs';
import { diamond } from './art.js';
import { TW, TH, SIZE, ROADS, iso } from './layout.js';
import { tileArt } from './assets.js';

/** How each biome looks. `trees` names a decor key; `density` scales how many. */
export const BIOME_LOOK = {
  plains: { ground: 'grass', tint: 0xffffff, trees: ['tree'], density: 1, flowers: 1 },
  meadow: { ground: 'grass', tint: 0xf0ffe0, trees: ['tree'], density: 0.6, flowers: 2.5 },
  forest: { ground: 'grass', tint: 0xa8c098, trees: ['tree'], density: 2, flowers: 0.5 },
  coast: { ground: 'grass', tint: 0xf4ffe8, trees: ['tree', 'palm'], density: 0.8, flowers: 1, water: true },
  desert: { ground: 'sand', tint: 0xffffff, trees: ['palm'], density: 0.45, flowers: 0 },
  canyon: { ground: 'sand', tint: 0xf0a888, trees: ['palm'], density: 0.3, flowers: 0 },
  snow: { ground: 'snow', tint: 0xffffff, trees: ['pine'], density: 1.2, flowers: 0 },
};

const FALLBACK = { grass: 0x6ea04a, sand: 0xe0c080, snow: 0xe8f0f8, road: 0xb8a27a, plaza: 0xcdbb94, dirt: 0xa8865a };

/** Young towns have dirt roads; paved streets come with growth. */
const PAVED = new Set(['town', 'city', 'capital']);

export const lookOf = (biome) => BIOME_LOOK[biome?.id] ?? BIOME_LOOK.plains;

/** One texture repeat per tile, laid along the tile edges from tile (0,0)'s north corner. */
const patterns = new Map();
function pattern(material) {
  const art = tileArt.get(material);
  if (!art) return null;
  if (!patterns.has(material)) {
    const size = art.texture.width;
    const p = new FillPattern(art.texture, 'repeat');
    p.setTransform(new Matrix(TW / 2 / size, TH / 2 / size, -TW / 2 / size, TH / 2 / size, 0, -TH / 2));
    patterns.set(material, p);
  }
  return patterns.get(material);
}

/** A layer of tiles of one material; tint goes on the layer so textures and fallbacks both take it. */
function layer(material, tiles, tint) {
  const g = new Graphics();
  const source = material === 'dirt' ? 'road' : material;
  const fill = pattern(source);
  for (const [x, y] of tiles) {
    const p = iso(x, y);
    diamond(g, p.x, p.y, TW, TH).fill(fill ?? FALLBACK[material]);
  }
  // Dirt is the cobble texture, browned and darkened.
  g.tint = material === 'dirt' ? (fill ? 0xc89868 : 0xffffff) : tint;
  return g;
}

export function drawGround({ biome, tier }) {
  const look = lookOf(biome);
  const paved = PAVED.has(tier?.id);
  const c = new Container();
  const groups = { base: [], road: [], plaza: [] };
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      const plaza = x >= 9 && x <= 11 && y >= 9 && y <= 11;
      const edge = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1;
      const road = !edge && (ROADS.includes(x) || ROADS.includes(y));
      groups[plaza ? 'plaza' : road ? 'road' : 'base'].push([x, y]);
    }
  }
  if (look.water) c.addChild(water());
  c.addChild(
    layer(look.ground, groups.base, look.tint),
    layer(paved ? 'road' : 'dirt', groups.road, 0xffffff),
    layer(paved ? 'plaza' : 'dirt', groups.plaza, 0xffffff),
  );

  // Cliff on the two near edges, coloured to the land.
  const g = new Graphics();
  const corner = (x, y) => iso(x - 0.5, y - 0.5);
  const e = corner(SIZE, 0), s = corner(SIZE, SIZE), w = corner(0, SIZE);
  const rock = look.ground === 'snow' ? 0x8a96a8 : look.ground === 'sand' ? 0xa0784a : 0x5a4632;
  g.poly([w.x, w.y, s.x, s.y, s.x, s.y + 14, w.x, w.y + 14]).fill(rock);
  g.poly([s.x, s.y, e.x, e.y, e.x, e.y + 14, s.x, s.y + 14]).fill(rock & 0xdddddd);
  c.addChild(g);
  if (tier?.id === 'capital') c.addChild(castleHill());
  return c;
}

/**
 * Coast towns sit on the shore: a band of sea along the two near edges, kept
 * to a few tiles so it never spills into the next town over.
 */
const SEA = 3;
function water() {
  const g = new Graphics();
  for (let x = 0; x < SIZE + SEA; x++) {
    for (let y = 0; y < SIZE + SEA; y++) {
      if (x < SIZE && y < SIZE) continue;
      const out = Math.max(x - SIZE + 1, y - SIZE + 1); // 1 at the shore, SEA at the horizon
      const p = iso(x, y);
      diamond(g, p.x, p.y + 10, TW, TH).fill(out === 1 ? 0x7cc6e8 : out === 2 ? 0x4aa3d4 : 0x3a8fc0);
    }
  }
  return g;
}

/** A raised lawn behind the north-east edge for the capital's castle. */
function castleHill() {
  const g = new Graphics();
  const p = iso(CASTLE.x, CASTLE.y);
  diamond(g, p.x, p.y, TW * 6, TH * 6).fill(0x5d8f3c);
  diamond(g, p.x, p.y - 3, TW * 5.4, TH * 5.4).fill(0x6ea04a);
  return g;
}

/** Where the capital's castle stands: outside the grid, behind the north-east wall. */
export const CASTLE = { x: 10, y: -4 };

/**
 * Walls along the two far edges, by tier. Drawn below the depth-sorted layer:
 * the far edges are behind everything in town anyway.
 */
export function drawWalls(tier) {
  const g = new Graphics();
  const id = tier?.id;
  if (id === 'camp') return g;
  const corner = (x, y) => iso(x - 0.5, y - 0.5);
  const w = corner(0, SIZE), n = corner(0, 0), e = corner(SIZE, 0);
  const segments = [[w, n], [n, e]];

  if (id === 'village') {
    // Wooden palisade: posts every half tile.
    for (const [a, b] of segments) {
      const steps = SIZE * 2;
      for (let i = 0; i <= steps; i++) {
        const x = a.x + ((b.x - a.x) * i) / steps, y = a.y + ((b.y - a.y) * i) / steps;
        g.rect(x - 1.5, y - 12, 3, 12).fill(0x7a5230);
        g.poly([x - 1.5, y - 12, x, y - 15, x + 1.5, y - 12]).fill(0x5a3a1a);
      }
    }
    return g;
  }

  const height = id === 'town' ? 8 : id === 'city' ? 18 : 24;
  const stone = 0x9a9488, top = 0xb8b2a6;
  for (const [a, b] of segments) {
    g.poly([a.x, a.y, b.x, b.y, b.x, b.y - height, a.x, a.y - height]).fill(stone).stroke({ width: 1, color: 0x5a554c, alpha: 0.6 });
    // Crenellations.
    const steps = SIZE * 2;
    for (let i = 0; i < steps; i += 2) {
      const x = a.x + ((b.x - a.x) * i) / steps, y = a.y + ((b.y - a.y) * i) / steps;
      g.rect(x - 2, y - height - 4, 5, 4).fill(top);
    }
  }
  if (id === 'city' || id === 'capital') {
    // Round towers on the three corners.
    for (const p of [w, n, e]) {
      g.rect(p.x - 7, p.y - height - 14, 14, height + 14).fill(0x8a8478).stroke({ width: 1, color: 0x5a554c });
      g.poly([p.x - 9, p.y - height - 14, p.x, p.y - height - 28, p.x + 9, p.y - height - 14]).fill(0x2e4a8a);
    }
  }
  return g;
}

/** Overall tint for a town's mood; multiplied with time of day. */
export function moodTint(mood) {
  return mood === 'abandoned' ? 0xc0b8a8 : 0xffffff;
}
