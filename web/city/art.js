/**
 * Every visual in the city, drawn from code.
 *
 * Nothing here is taken from Ragnarok Online: the characters are 12×16 pixel
 * maps defined below and the buildings are flat isometric boxes. See the asset
 * note in README.md before replacing any of this with real sprites.
 */
import { Graphics, Texture, Container, Text } from '/vendor/pixi.mjs';
import { TW, TH } from './layout.js';

/* ── Characters ─────────────────────────────────────────────────────────── */

// o outline · h hat/hair · s skin · e eye · b body · d body accent · l legs
const HEAD = [
  '...oooooo...',
  '..ohhhhhho..',
  '.ohhhhhhhho.',
  '.ohssssssho.',
  '.osesssseso.',
  '.osssssssso.',
  '..osssssso..',
];
const TORSO = [
  '..obbbbbbo..',
  '.obbbddbbbo.',
  'osbbbddbbbso',
  'osbbbddbbbso',
  '.obbbbbbbbo.',
  '..obbbbbbo..',
];
// Seen from behind: hair covers the face, no eyes.
const HEAD_BACK = [
  '...oooooo...',
  '..ohhhhhho..',
  '.ohhhhhhhho.',
  '.ohhhhhhhho.',
  '.ohhhhhhhho.',
  '.oshhhhhhso.',
  '..osssssso..',
];
const LEGS_A = ['..oll..llo..', '..oll..llo..', '..ooo..ooo..'];
const LEGS_B = ['...olllllo..', '..oll...llo.', '..ooo...ooo'];
const LEGS_SIT = ['.ollllllllo.', '.oooooooooo.'];

export const FRAMES = {
  stand: [...HEAD, ...TORSO, ...LEGS_A],
  walk: [...HEAD, ...TORSO, ...LEGS_B],
  sit: ['............', ...HEAD, ...TORSO.slice(0, 5), ...LEGS_SIT],
  stand_n: [...HEAD_BACK, ...TORSO, ...LEGS_A],
  walk_n: [...HEAD_BACK, ...TORSO, ...LEGS_B],
};

/** Job class palettes. Only colours differ; the silhouette is shared. */
export const CLASSES = {
  knight: { h: '#9aa0ab', b: '#c0392b', d: '#f0c040', accent: 0xc0392b },
  assassin: { h: '#2c2c3a', b: '#6c3483', d: '#c0c0d0', accent: 0x8e44ad },
  hunter: { h: '#3d7a2f', b: '#1e8449', d: '#d8b878', accent: 0x27ae60 },
  bard: { h: '#d4a017', b: '#2471a3', d: '#f5f5f5', accent: 0x2e86c1 },
  novice: { h: '#7a5230', b: '#a08060', d: '#6e5840', accent: 0x95a5a6 },
  kafra: { h: '#5a3a22', b: '#2a3f7a', d: '#ffffff', accent: 0xe8a0b8 },
  // Townsfolk: ambient, never an agent.
  villager1: { h: '#c47a3a', b: '#8aa05a', d: '#e8dcc0', accent: 0 },
  villager2: { h: '#3a2a1a', b: '#c8a050', d: '#7a5230', accent: 0 },
  villager3: { h: '#e0c060', b: '#a05a6a', d: '#f5ecd7', accent: 0 },
};

const SHARED = { o: '#1a1206', s: '#f2d2a9', e: '#2e2416', l: '#4a3826' };

const textureCache = new Map();

/** One frame of one class as a nearest-neighbour texture. */
export function charTexture(cls, frame) {
  const key = `${cls}:${frame}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const rows = FRAMES[frame];
  const palette = { ...SHARED, ...(CLASSES[cls] ?? CLASSES.novice) };
  const canvas = document.createElement('canvas');
  canvas.width = 12;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  const top = 16 - rows.length;
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const c = palette[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y + top, 1, 1);
    }
  });
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  textureCache.set(key, tex);
  return tex;
}

/* ── Decorations ────────────────────────────────────────────────────────── */

/** Round-canopy tree; `v` (0–1) varies size and green so a forest doesn't tile visibly. */
export function tree(v) {
  const g = new Graphics();
  const h = 10 + v * 8;
  const r = 9 + v * 4;
  const greens = [0x2e7d32, 0x388e3c, 0x43a047, 0x2f6b2a];
  const green = greens[Math.floor(v * greens.length) % greens.length];
  g.ellipse(0, 0, r * 0.8, r * 0.35).fill({ color: 0x000000, alpha: 0.2 });
  g.rect(-2, -h, 4, h).fill(0x6e4b2a);
  g.circle(0, -h - r * 0.6, r).fill(green).stroke({ width: 1, color: 0x1a3a12, alpha: 0.6 });
  g.circle(-r * 0.35, -h - r * 0.9, r * 0.45).fill(shade(green, 1.18));
  return g;
}

export function lamp() {
  const g = new Graphics();
  g.rect(-1, -22, 2, 22).fill(0x3a3a42);
  g.rect(-3, -27, 6, 6).fill(0xffe08a).stroke({ width: 1, color: 0x3a3a42 });
  return g;
}

export function flowers(v) {
  const g = new Graphics();
  const colors = [0xff7675, 0xfdcb6e, 0xffffff, 0xa29bfe];
  for (let i = 0; i < 5; i++) {
    const a = v * 10 + i * 1.7;
    g.rect(Math.cos(a) * 8 - 1, Math.sin(a) * 3 - 1, 2, 2).fill(colors[(i + Math.floor(v * 4)) % colors.length]);
  }
  return g;
}

export function bench() {
  const g = new Graphics();
  g.poly([-9, -4, 3, 2, 3, 0, -9, -6]).fill(0x8b5a2b);
  g.rect(-8, -3, 1, 4).fill(0x5a3a1a).rect(2, 2, 1, 4).fill(0x5a3a1a);
  return g;
}

/* ── Hand-held items ────────────────────────────────────────────────────── */

/** Small item drawn with its grip at (0,0), so rotating it swings it like a tool. */
export function itemGraphic(kind) {
  const g = new Graphics();
  switch (kind) {
    case 'build': // hammer
      g.rect(-1, -9, 2, 10).fill(0x7a5230);
      g.rect(-4, -12, 8, 4).fill(0x9aa0ab).rect(-4, -12, 8, 1).fill(0xd0d4dc);
      break;
    case 'research': // open book
      g.rect(-6, -5, 6, 7).fill(0xf5ecd7).rect(0, -5, 6, 7).fill(0xebe0c4);
      g.rect(-6, -5, 12, 7).stroke({ width: 1, color: 0x6b3a1f });
      g.rect(-4, -3, 3, 1).fill(0x998866).rect(1, -3, 3, 1).fill(0x998866);
      break;
    case 'craft': // flask
      g.rect(-1, -10, 2, 3).fill(0xdfe6e9);
      g.poly([-4, -7, 4, -7, 5, 0, -5, 0]).fill(0x55efc4).stroke({ width: 1, color: 0x1a1206 });
      break;
    case 'trial': // sword
      g.rect(-1, -14, 2, 12).fill(0xdfe6e9).rect(-3, -3, 6, 2).fill(0xc9a227).rect(-1, -1, 2, 3).fill(0x7a5230);
      break;
    case 'deliver': // crate
      g.rect(-5, -9, 10, 8).fill(0xb7864b).stroke({ width: 1, color: 0x5a3a1a });
      g.rect(-5, -6, 10, 1).fill(0x5a3a1a);
      break;
    case 'summon':
    case 'cast':
    case 'teleport': // staff
      g.rect(-1, -14, 2, 15).fill(0x7a5230);
      g.circle(0, -15, 3).fill(0x74b9ff).stroke({ width: 1, color: 0xffffff });
      break;
    default:
      return null;
  }
  return g;
}

/* ── Ground ─────────────────────────────────────────────────────────────── */

export function diamond(g, cx, cy, w, h) {
  return g.poly([cx, cy - h / 2, cx + w / 2, cy, cx, cy + h / 2, cx - w / 2, cy]);
}

/* ── Buildings ──────────────────────────────────────────────────────────── */

function shade(hex, f) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

/**
 * An isometric box on an n×n footprint, origin at the footprint's centre on the
 * ground. Returns the screen points other decorations hang off.
 */
function box(g, n, height, wall, { outline = 0x1a1206 } = {}) {
  const hw = (n * TW) / 2;
  const hh = (n * TH) / 2;
  const L = [-hw, 0], B = [0, hh], R = [hw, 0], T = [0, -hh];
  const up = ([x, y]) => [x, y - height];
  g.poly([...L, ...B, ...up(B), ...up(L)]).fill(shade(wall, 0.85)).stroke({ width: 1, color: outline, alpha: 0.6 });
  g.poly([...B, ...R, ...up(R), ...up(B)]).fill(shade(wall, 0.68)).stroke({ width: 1, color: outline, alpha: 0.6 });
  g.poly([...up(L), ...up(B), ...up(R), ...up(T)]).fill(wall).stroke({ width: 1, color: outline, alpha: 0.6 });
  return { hw, hh, L, B, R, T, height };
}

/** Hip roof over a box. */
function roof(g, b, color, rise) {
  const { hw, hh, height } = b;
  const apex = [0, -height - rise];
  const L = [-hw - 3, -height], B = [0, hh - height + 2], R = [hw + 3, -height], T = [0, -hh - height - 2];
  g.poly([...T, ...L, ...apex]).fill(shade(color, 0.75));
  g.poly([...T, ...R, ...apex]).fill(shade(color, 0.6));
  g.poly([...L, ...B, ...apex]).fill(color).stroke({ width: 1, color: 0x1a1206, alpha: 0.5 });
  g.poly([...B, ...R, ...apex]).fill(shade(color, 0.78)).stroke({ width: 1, color: 0x1a1206, alpha: 0.5 });
}

/** A row of windows on the two visible faces; lit windows mean someone is inside working. */
function windows(g, b, floors, lit) {
  const { hw, hh } = b;
  const glass = lit ? 0xffe08a : 0x3a4a5a;
  for (let f = 0; f < floors; f++) {
    const y0 = -10 - f * 12;
    for (const t of [0.3, 0.7]) {
      // Left face runs from L(-hw,0) to B(0,hh); right face from B to R(hw,0).
      const lx = -hw + t * hw, ly = t * hh + y0;
      const rx = t * hw, ry = hh - t * hh + y0;
      g.poly([lx - 2, ly - 1, lx + 2, ly + 1, lx + 2, ly + 6, lx - 2, ly + 4]).fill(glass);
      g.poly([rx - 2, ry + 1, rx + 2, ry - 1, rx + 2, ry + 4, rx - 2, ry + 6]).fill(shade(glass, 0.85));
    }
  }
}

function door(g, b) {
  const { hh } = b;
  g.poly([-6, hh - 3, -2, hh - 1, -2, hh - 10, -6, hh - 12]).fill(0x5a3a1a);
}

const ROOF_COLORS = [0xb03a2e, 0x2e6da4, 0x2e8b57, 0x8e44ad, 0xd68910, 0x16a085, 0xa04000, 0x5d6d7e];

export function hashColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ROOF_COLORS[h % ROOF_COLORS.length];
}

/**
 * Level 1–5 from how much code lives in a folder. Log scale: a 2,000-file folder
 * should be a tower, not a skyscraper that hides the rest of the town.
 */
export function levelOf(district) {
  return Math.max(1, Math.min(5, Math.ceil(Math.log10(district.files + 1) * 1.6)));
}

/** A district building: one per top-level folder. */
export function districtBuilding(district, { lit, level = levelOf(district) }) {
  const g = new Graphics();
  const b = box(g, 2, 14 + level * 12, 0xe8dcc0);
  windows(g, b, level, lit);
  door(g, b);
  roof(g, b, hashColor(district.name), 14 + level * 2);
  // Banner showing activity this week.
  if (district.churn > 0) {
    const top = -b.height - 14 - level * 2;
    g.rect(-1, top - 12, 2, 12).fill(0x5a3a1a);
    g.poly([1, top - 12, 11, top - 9, 1, top - 6]).fill(0xf1c40f);
  }
  return { g, height: b.height + 14 + level * 2 };
}

/** Scaffolding drawn in front of a building with uncommitted changes. */
export function scaffolding(height) {
  const g = new Graphics();
  const hw = TW, hh = TH;
  const wood = 0x8b5a2b;
  for (const [x, y] of [[-hw - 2, 0], [0, hh + 2], [hw + 2, 0]]) {
    g.rect(x - 1, y - height - 6, 2, height + 6).fill(wood);
  }
  for (let h = 12; h < height; h += 14) {
    g.moveTo(-hw - 2, -h).lineTo(0, hh + 2 - h).lineTo(hw + 2, -h).stroke({ width: 2, color: wood });
  }
  return g;
}

export function library() {
  const g = new Graphics();
  const b = box(g, 2, 52, 0xd8d0c0);
  windows(g, b, 3, false);
  door(g, b);
  roof(g, b, 0x2e4a8a, 40);
  g.circle(0, -b.height - 46, 3).fill(0xf1c40f);
  return g;
}

export function workshop() {
  const g = new Graphics();
  const b = box(g, 2, 26, 0xa08870);
  door(g, b);
  roof(g, b, 0x5d4037, 12);
  g.rect(10, -b.height - 26, 7, 22).fill(0x6e5840).stroke({ width: 1, color: 0x1a1206, alpha: 0.6 });
  // Anvil out front.
  g.rect(-30, 10, 10, 3).fill(0x4a4a52).rect(-27, 13, 4, 4).fill(0x3a3a42);
  return g;
}

export function inn() {
  const g = new Graphics();
  const b = box(g, 2, 30, 0xe0cfa8);
  windows(g, b, 2, true);
  door(g, b);
  roof(g, b, 0x2e7d32, 16);
  g.rect(-30, -24, 16, 9).fill(0x5a3a1a);
  return g;
}

export function arena() {
  const g = new Graphics();
  diamond(g, 0, 0, TW * 2.6, TH * 2.6).fill(0xc8a46e);
  const post = (x, y) => g.rect(x - 1, y - 8, 2, 8).fill(0x6e4b2a);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    post(-TW * 1.3 + t * TW * 1.3, t * TH * 1.3);
    post(t * TW * 1.3, TH * 1.3 - t * TH * 1.3);
  }
  // Training dummies.
  for (const [x, y] of [[-10, -4], [12, 2]]) {
    g.rect(x - 1, y - 18, 2, 18).fill(0x6e4b2a);
    g.rect(x - 5, y - 16, 10, 2).fill(0x6e4b2a);
    g.circle(x, y - 20, 4).fill(0xd8b878).stroke({ width: 1, color: 0x6e4b2a });
  }
  return g;
}

/** The plaza booth. The attendant standing beside it is a character sprite, added by the town. */
export function kafraBooth() {
  const g = new Graphics();
  const b = box(g, 1, 16, 0xf5ecd7);
  // Striped awning.
  const { hw, hh, height } = b;
  for (let i = 0; i < 4; i++) {
    const t0 = i / 4, t1 = (i + 1) / 4;
    const col = i % 2 ? 0xffffff : 0xe8a0b8;
    g.poly([
      -hw - 3 + t0 * (hw + 3), -height + t0 * (hh + 2) - 4,
      -hw - 3 + t1 * (hw + 3), -height + t1 * (hh + 2) - 4,
      -hw - 3 + t1 * (hw + 3), -height + t1 * (hh + 2) - 12,
      -hw - 3 + t0 * (hw + 3), -height + t0 * (hh + 2) - 12,
    ]).fill(col);
    g.poly([
      t0 * (hw + 3), -height + hh + 2 - t0 * (hh + 2) - 4,
      t1 * (hw + 3), -height + hh + 2 - t1 * (hh + 2) - 4,
      t1 * (hw + 3), -height + hh + 2 - t1 * (hh + 2) - 12,
      t0 * (hw + 3), -height + hh + 2 - t0 * (hh + 2) - 12,
    ]).fill(shade(col, 0.85));
  }
  return g;
}

/** Warp portal: drawn flat; the glow is animated by the town. */
export function warpPortal() {
  const g = new Graphics();
  g.ellipse(0, 0, 18, 9).fill({ color: 0x74b9ff, alpha: 0.35 }).stroke({ width: 2, color: 0xa0d8ff });
  g.ellipse(0, 0, 11, 5.5).stroke({ width: 1, color: 0xffffff, alpha: 0.8 });
  return g;
}

/* ── Labels ─────────────────────────────────────────────────────────────── */

export function label(text, { size = 10, color = 0xffffff, weight = 'bold' } = {}) {
  const t = new Text({
    text,
    style: {
      fontFamily: 'Verdana, Tahoma, sans-serif',
      fontSize: size,
      fontWeight: weight,
      fill: color,
      stroke: { color: 0x1a1206, width: 3, join: 'round' },
    },
    resolution: Math.max(2, window.devicePixelRatio * 2),
  });
  t.anchor.set(0.5, 0);
  return t;
}

/** Signboard: label on a parchment plate. */
export function signboard(text) {
  const c = new Container();
  const t = new Text({
    text,
    style: { fontFamily: 'Verdana, Tahoma, sans-serif', fontSize: 9, fontWeight: 'bold', fill: 0x2e2416 },
    resolution: Math.max(2, window.devicePixelRatio * 2),
  });
  t.anchor.set(0.5);
  const w = t.width + 10, h = t.height + 4;
  const g = new Graphics()
    .rect(-w / 2, -h / 2, w, h).fill(0xe8dcc0).stroke({ width: 1, color: 0x8b7355 });
  c.addChild(g, t);
  return c;
}
