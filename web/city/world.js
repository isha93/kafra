/**
 * The overworld: kingdoms as islands, towns on them, roads between.
 *
 * A kingdom is a GitHub owner, so an org's repos share an island and a
 * personal account gets its own. Repos with no remote share "the wilds".
 * Positions are tiles in one global isometric space, the same space each
 * town's own tiles live in, offset by the town's origin.
 */
import { Container, Graphics, Text, Sprite } from '/vendor/pixi.mjs';
import { iso, SIZE } from './layout.js';
import { label } from './art.js';
import { seeded } from './decor.js';
import { STATUS, statusOf } from './status.js';
import { bodyFrame } from './skin.js';

const STEP = SIZE + 12;      // tiles from one town's origin to the next inside a kingdom
const COAST = 7;             // land margin around a kingdom's towns, in tiles
const SEA_GAP = 16;          // open water between kingdoms

export const WILDS = 'Tanah Liar';

export const kingdomOf = (t) => t.owner || WILDS;

/**
 * Lay out kingdoms and towns. Order is stable: kingdoms by name, towns by repo
 * path, so a town only moves when a repo is added or removed beside it.
 */
export function layoutWorld(towns) {
  const groups = new Map();
  for (const t of towns) {
    const k = kingdomOf(t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const names = [...groups.keys()].sort((a, b) => (a === WILDS) - (b === WILDS) || a.localeCompare(b));

  const kingdoms = [];
  const positions = new Map();
  // Kingdoms on a loose grid of their own; each kingdom's towns on a grid inside it.
  const perRow = Math.ceil(Math.sqrt(names.length));
  let cursorX = 0, cursorY = 0, rowDepth = 0;
  names.forEach((name, k) => {
    const list = groups.get(name).sort((a, b) => String(a.root ?? a.id).localeCompare(String(b.root ?? b.id)));
    const cols = Math.ceil(Math.sqrt(list.length));
    const rows = Math.ceil(list.length / cols);
    const w = cols * STEP - 12, h = rows * STEP - 12;
    if (k > 0 && k % perRow === 0) { cursorX = 0; cursorY += rowDepth + SEA_GAP + COAST * 2; rowDepth = 0; }
    const x0 = cursorX + COAST, y0 = cursorY + COAST;
    list.forEach((t, i) => positions.set(t.id, { x: x0 + (i % cols) * STEP, y: y0 + Math.floor(i / cols) * STEP, kingdom: name }));
    kingdoms.push({ name, towns: list.map((t) => t.id), x0, y0, x1: x0 + w, y1: y0 + h });
    cursorX += w + COAST * 2 + SEA_GAP;
    rowDepth = Math.max(rowDepth, h);
  });
  return { kingdoms, positions, key: kingdoms.map((k) => `${k.name}:${k.towns.join(',')}`).join('|') };
}

/** Screen point at the middle of a town placed at tile origin `o`. */
export const townCentre = (o) => iso(o.x + SIZE / 2, o.y + SIZE / 2);

const CREST = [0xc0392b, 0x2e6da4, 0x2e8b57, 0x8e44ad, 0xd68910, 0x16a085];
function crestColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CREST[h % CREST.length];
}

/**
 * An island: the kingdom's tile rectangle grown by COAST, projected, with
 * each edge broken into a wobbly coastline seeded by the kingdom's name.
 */
function island(k) {
  const rand = seeded(k.name);
  const m = COAST;
  const corners = [[k.x0 - m, k.y0 - m], [k.x1 + m, k.y0 - m], [k.x1 + m, k.y1 + m], [k.x0 - m, k.y1 + m]];
  const pts = [];
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i], [bx, by] = corners[(i + 1) % 4];
    const steps = Math.max(6, Math.round(Math.hypot(bx - ax, by - ay) / 3));
    // Outward normal in tile space.
    const nx = Math.sign(by - ay), ny = -Math.sign(bx - ax);
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const bump = (rand() - 0.35) * 2.6;
      const p = iso(ax + (bx - ax) * t + nx * bump, ay + (by - ay) * t + ny * bump);
      pts.push(p.x, p.y);
    }
  }
  return pts;
}

/** Roads: each town joins the nearest town placed before it, so a kingdom is one connected tree. */
function roads(k, positions) {
  const g = new Graphics();
  const placed = [];
  for (const id of k.towns) {
    const o = positions.get(id);
    if (placed.length) {
      const near = placed.reduce((a, b) => (Math.hypot(b.x - o.x, b.y - o.y) < Math.hypot(a.x - o.x, a.y - o.y) ? b : a));
      // L-shaped along the tile axes, like the streets inside a town.
      const a = { x: near.x + SIZE / 2, y: near.y + SIZE / 2 }, b = { x: o.x + SIZE / 2, y: o.y + SIZE / 2 };
      const mid = { x: b.x, y: a.y };
      const pa = iso(a.x, a.y), pm = iso(mid.x, mid.y), pb = iso(b.x, b.y);
      g.moveTo(pa.x, pa.y).lineTo(pm.x, pm.y).lineTo(pb.x, pb.y).stroke({ width: 14, color: 0x8a6a40, join: 'round', cap: 'round' });
      g.moveTo(pa.x, pa.y).lineTo(pm.x, pm.y).lineTo(pb.x, pb.y).stroke({ width: 9, color: 0xc4a070, join: 'round', cap: 'round' });
    }
    placed.push(o);
  }
  return g;
}

/** Land, shallows, roads and kingdom banners; redrawn only when the layout changes. */
export function drawWorld(layout) {
  const c = new Container();
  for (const k of layout.kingdoms) {
    const pts = island(k);
    const g = new Graphics();
    g.poly(pts).stroke({ width: 40, color: 0x3f86b0, alpha: 0.7, join: 'round' });
    g.poly(pts).stroke({ width: 14, color: 0xe2cf9a, join: 'round' });
    g.poly(pts).fill(k.name === WILDS ? 0x6b7a4a : 0x4f7a3a);
    // Texture: darker meadow blotches.
    const rand = seeded(k.name + ':land');
    for (let i = 0; i < 40; i++) {
      const p = iso(k.x0 - COAST / 2 + rand() * (k.x1 - k.x0 + COAST), k.y0 - COAST / 2 + rand() * (k.y1 - k.y0 + COAST));
      g.ellipse(p.x, p.y, 30 + rand() * 60, 14 + rand() * 24).fill({ color: 0x3f6a2e, alpha: 0.35 });
    }
    c.addChild(g, roads(k, layout.positions));

    // Banner at the island's north corner.
    const top = iso(k.x0 - COAST + 1, k.y0 - COAST + 1);
    const banner = new Container();
    const crest = new Graphics()
      .poly([-14, -18, 14, -18, 14, 4, 0, 16, -14, 4]).fill(crestColor(k.name)).stroke({ width: 3, color: 0xf1c40f });
    crest.poly([-6, -6, 6, -6, 6, 2, 0, 7, -6, 2]).fill(0xf5ecd7);
    const name = label(k.name === WILDS ? WILDS : `Kerajaan ${k.name}`, { size: 28 });
    name.y = 22;
    const count = label(`${k.towns.length} kota`, { size: 16, color: 0xffe08a, weight: 'normal' });
    count.y = 56;
    banner.addChild(crest, name, count);
    banner.position.set(top.x, top.y - 260);
    banner.isBanner = true;
    c.addChild(banner);
  }
  return c;
}

/**
 * Far-zoom marker for a town: a pin with tier stars and the most urgent
 * agent status, kept at a constant size on screen.
 */
export class TownMarker {
  constructor(onPick) {
    this.view = new Container();
    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';
    this.view.on('pointertap', (e) => { e.stopPropagation(); onPick?.(); });
    this.pin = new Graphics();
    this.name = label('', { size: 14 });
    this.name.y = 6;
    this.stars = new Text({ text: '', style: { fontSize: 11, fill: 0xffd54f, stroke: { color: 0x1a1206, width: 3 } }, resolution: 3 });
    this.stars.anchor.set(0.5, 0);
    this.stars.y = 24;
    this.view.addChild(this.pin, this.name, this.stars);
    this.phase = Math.random() * 6;
  }

  update(town) {
    // The worst status among awake agents decides the pin colour.
    const statuses = town.agents.filter((a) => a.status !== 'resting').map(statusOf);
    const worst = statuses.sort((a, b) => STATUS[a].rank - STATUS[b].rank)[0] ?? null;
    this.status = worst;
    const color = worst ? STATUS[worst].color : 0x5a5a5a;
    this.pin.clear()
      .circle(0, -14, 11).fill(color).circle(0, -14, 11).stroke({ width: 3, color: 0x1a1206 })
      .poly([-6, -6, 6, -6, 0, 4]).fill(0x1a1206)
      .circle(0, -14, 4).fill(0xffffff);
    this.name.text = town.town;
    this.stars.text = '★'.repeat(town.tier?.stars ?? 1);
  }

  tick(dt, zoom) {
    this.phase += dt;
    this.view.scale.set(Math.min(6, 0.9 / zoom));
    const urgent = this.status === 'waiting' || this.status === 'error';
    this.pin.scale.set(urgent ? 1 + Math.abs(Math.sin(this.phase * 4)) * 0.25 : 1);
  }
}

/**
 * An agent walking the road from one town to another after its session moved
 * repos. Purely visual: the agent already exists in the destination town.
 */
export class Traveler {
  constructor(layer, cls, from, to) {
    this.from = from;
    this.to = to;
    this.t = 0;
    this.view = new Container();
    this.body = new Sprite();
    this.view.addChild(new Graphics().ellipse(0, 0, 10, 4).fill({ color: 0x000000, alpha: 0.3 }), this.body);
    this.cls = cls;
    this.view.scale.set(2.5);
    layer.addChild(this.view);
    this.duration = Math.min(6, 2 + Math.hypot(to.x - from.x, to.y - from.y) / 800);
  }

  /** Returns true once arrived (and gone). */
  tick(dt) {
    this.t += dt / this.duration;
    if (this.t >= 1) { this.view.destroy({ children: true }); return true; }
    const p = { x: this.from.x + (this.to.x - this.from.x) * this.t, y: this.from.y + (this.to.y - this.from.y) * this.t };
    this.view.position.set(p.x, p.y - Math.abs(Math.sin(this.t * 40)) * 3);
    const f = bodyFrame(this.cls, 'walk', this.to.y < this.from.y ? 'n' : this.to.x >= this.from.x ? 'e' : 'w', this.t * this.duration);
    this.body.texture = f.texture;
    this.body.anchor.set(f.anchor[0], f.anchor[1]);
    this.body.scale.set(f.scale * (f.flip ? -1 : 1), f.scale);
    return false;
  }
}
