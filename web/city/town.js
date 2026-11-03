/**
 * One repo as one town: ground, buildings, the Kafra booth and the agents in it.
 *
 * The static parts (ground, civic buildings) are drawn once; district buildings
 * are redrawn only when their stats change, and agents are patched in place so
 * they keep walking smoothly across server updates.
 */
import { Container, Graphics, Sprite } from '/vendor/pixi.mjs';
import {
  districtBuilding, scaffolding, library, workshop, inn, arena,
  kafraBooth, warpPortal, label, signboard, levelOf,
} from './art.js';
import { TW, TH, SIZE, iso, DISTRICT_SLOTS, CIVIC, spotFor } from './layout.js';
import { AgentSprite } from './agent.js';
import { Fx } from './fx.js';
import { decorate, seeded } from './decor.js';
import { Villager } from './villager.js';
import { bodyFrame } from './skin.js';
import { buildingArt } from './assets.js';
import { drawGround, drawWalls, moodTint, CASTLE } from './land.js';
import { isStormy } from './sky.js';
import { LONG_RUN_MS, LOW_HP } from './status.js';
import { sfxAt } from './audio.js';

/**
 * Real art for a building key when web/assets has it, else the drawn fallback.
 * Returns the display object and its height, which scaffolding needs.
 */
function artOr(key, fallback) {
  const art = buildingArt.get(key);
  if (!art) return fallback();
  const sprite = new Sprite(art.texture);
  sprite.anchor.set(art.anchor[0], art.anchor[1]);
  sprite.scale.set(art.scale);
  return { g: sprite, height: sprite.height };
}

/** "owner/name", or whichever half exists (public mode blanks the name). */
export const repoLabel = (t) => [t.owner, t.name].filter(Boolean).join('/');
/** A folder gets a trailing slash; the root and public mode's numbered districts don't. */
export const districtLabel = (name) => (name === '(root)' ? 'Balai Kota' : name.startsWith('Distrik') ? name : `${name}/`);

/** What a town's look is built from; when this changes the town is rebuilt from scratch. */
export const growthKey = (t) => `${t.tier?.id}|${t.biome?.id}|${t.mood}`;

/** Townsfolk by mood: a busy town fills its streets, an abandoned one has a straggler. */
const FOLK = { bustling: 7, steady: 4, abandoned: 1 };

/** Multiply two tints, the way stacking two tinted sheets would. */
function mixTint(a, b) {
  const m = (sh) => Math.round((((a >> sh) & 255) * ((b >> sh) & 255)) / 255);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

export class Town {
  constructor(data, { onSelect, onEvent }) {
    this.id = data.id;
    this.onSelect = onSelect;
    this.onEvent = onEvent;
    this.view = new Container();
    this.layer = new Container();       // everything that depth-sorts
    this.layer.sortableChildren = true;
    this.fx = new Fx(this.layer);
    this.agents = new Map();
    this.buildings = new Map();
    this.shakes = new Map();
    this.time = 0;

    this.key = growthKey(data);
    this.tier = data.tier;
    this.mood = data.mood;

    this.clouds = new Container();
    this.ground = drawGround(data);
    this.view.addChild(this.ground, drawWalls(data.tier), this.layer, this.clouds);
    this.drawCivic(data.tier);

    const { lamps, parks } = decorate(this.id, (obj, x, y, bias) => this.put(obj, x, y, bias), data);
    this.parks = parks.map((p, i) => this.put(p, DISTRICT_SLOTS[i][0], DISTRICT_SLOTS[i][1]));

    const rand = seeded(this.id + ':folk');
    const folk = Math.min(FOLK[data.mood] ?? 4, data.tier?.id === 'camp' ? 2 : 99);
    this.villagers = Array.from({ length: folk }, (_, i) => new Villager(`villager${(i % 3) + 1}`, rand));
    for (const v of this.villagers) this.layer.addChild(v.view);

    this.drawSky(lamps, rand);
    this.title = new Container();
    this.view.addChild(this.title);
    this.apply(data);
  }

  /**
   * Night tints the ground and everything standing on it (container tint is
   * inherited in Pixi 8); lamp light is additive on top, so lamps actually
   * brighten the dark instead of just being yellow.
   */
  drawSky(lamps, rand) {
    this.glow = new Container();
    this.glow.blendMode = 'add';
    const halo = (x, y, r, color) => {
      const p = iso(x, y);
      const g = new Graphics();
      for (let i = 4; i >= 1; i--) g.ellipse(0, 0, (r * i) / 4, (r * i) / 8).fill({ color, alpha: 0.06 });
      g.position.set(p.x, p.y - 4);
      this.glow.addChild(g);
      return g;
    };
    for (const l of lamps) halo(l.x, l.y, 36, 0xffb860);
    halo(CIVIC.kafra.x, CIVIC.kafra.y, 56, 0xff9ec0);
    halo(CIVIC.warp.x, CIVIC.warp.y, 40, 0x74b9ff);

    // Cloud shadows drifting over the town, clipped to it so they never darken the gaps between towns.
    const c = (x, y) => iso(x - 0.5, y - 0.5);
    const n = c(0, 0), e = c(SIZE, 0), s = c(SIZE, SIZE), w = c(0, SIZE);
    const mask = new Graphics().poly([n.x, n.y, e.x, e.y, s.x, s.y, w.x, w.y]).fill(0xffffff);
    this.view.addChild(mask);
    this.clouds.mask = mask;
    for (let i = 0; i < 3; i++) {
      const g = new Graphics().ellipse(0, 0, 90 + rand() * 60, 34 + rand() * 16).fill({ color: 0x000000, alpha: 0.2 });
      g.position.set((rand() - 0.5) * SIZE * TW, rand() * SIZE * TH);
      g.speed = 6 + rand() * 6;
      this.clouds.addChild(g);
    }

    this.view.addChild(this.glow);
  }

  /** Add a depth-sorted object standing on tile (x, y). */
  put(obj, x, y, bias = 0) {
    const p = iso(x, y);
    obj.position.set(p.x, p.y);
    obj.zIndex = p.y + bias;
    this.layer.addChild(obj);
    return obj;
  }

  /**
   * Civic buildings by tier: a camp has tents where the buildings will be, a
   * village has no arena yet, and a capital adds a castle behind its walls.
   */
  drawCivic(tier) {
    const id = tier?.id;
    const tent = () => artOr('tent', () => ({ g: inn() })).g;
    const built = (key, draw) => (id === 'camp' || (key === 'arena' && id === 'village') ? tent() : artOr(key, () => ({ g: draw() })).g);
    const clickable = (obj, sel) => {
      obj.eventMode = 'static';
      obj.cursor = 'pointer';
      obj.on('pointertap', (e) => { e.stopPropagation(); this.onSelect?.(sel); });
      return obj;
    };
    const civic = (key, g) => {
      const { x, y, label: text } = CIVIC[key];
      this.put(clickable(g, { type: 'civic', town: this.id, key }), x, y);
      const sign = signboard(text);
      this.put(sign, x + 1.2, y + 1.2, 40);
    };
    civic('library', built('library', library));
    civic('workshop', built('workshop', workshop));
    civic('inn', built('inn', inn));
    civic('arena', built('arena', arena));
    civic('kafra', artOr('kafra', () => ({ g: kafraBooth() })).g);
    if (id === 'capital' && buildingArt.has('castle')) {
      // Behind everything in town, so it sorts under the north-east edge.
      this.put(clickable(artOr('castle', () => ({ g: new Graphics() })).g, { type: 'town', id: this.id }), CASTLE.x, CASTLE.y, -2000);
    }

    this.portal = warpPortal();
    const p = iso(CIVIC.warp.x, CIVIC.warp.y);
    this.portal.position.set(p.x, p.y);
    this.portal.zIndex = p.y - 20;
    this.layer.addChild(this.portal);

    // The attendant. Clicking her opens the town's storage: the build log.
    const npc = new Sprite();
    this.kafraNpc = this.put(clickable(npc, { type: 'town', id: this.id }), CIVIC.kafra.x - 0.2, CIVIC.kafra.y + 0.9);

    // Workshop chimney smoke is ambient while anyone is crafting here; a camp's smoke rises from its fire.
    const w = id === 'camp' ? iso(11.4, 9.0) : iso(CIVIC.workshop.x, CIVIC.workshop.y);
    this.chimney = id === 'camp' ? { x: w.x, y: w.y - 12, z: w.y + 1 } : { x: w.x + 13, y: w.y - 60, z: w.y + 1 };
  }

  drawTitle(data) {
    this.title.removeChildren().forEach((c) => c.destroy({ children: true }));
    const top = iso(-1.5, -1.5);
    const stars = '★'.repeat(data.tier?.stars ?? 1) + '☆'.repeat(5 - (data.tier?.stars ?? 1));
    const name = label(`${data.town}`, { size: 20 });
    const rank = label(`${stars}  ${data.tier?.name ?? ''} · ${data.biome?.name ?? ''}${data.mood === 'abandoned' ? ' · terbengkalai' : data.mood === 'bustling' ? ' · ramai' : ''}`, {
      size: 10, color: 0xffd54f,
    });
    rank.position.set(top.x, top.y - 98);
    // High enough to clear the library tower in the north corner.
    name.position.set(top.x, top.y - 150);
    const repo = label(`${repoLabel(data)}${data.branch ? `  ⎇ ${data.branch}` : ''}`, {
      size: 10, color: 0xffe08a, weight: 'normal',
    });
    repo.position.set(top.x, top.y - 124);
    this.title.addChild(name, repo, rank);
    this.title.eventMode = 'static';
    this.title.cursor = 'pointer';
    this.title.on('pointertap', (e) => { e.stopPropagation(); this.onSelect?.({ type: 'town', id: this.id }); });
  }

  /** Server snapshot → scene. */
  apply(data) {
    const prev = this.data;
    this.data = data;
    if (!prev || prev.town !== data.town || prev.branch !== data.branch || prev.name !== data.name || prev.tier?.id !== data.tier?.id) this.drawTitle(data);
    this.applyBuildings(data);
    this.applyAgents(data, prev);
    if (prev) this.diffCommits(prev, data);
  }

  applyBuildings(data) {
    const working = new Set(data.agents.filter((a) => a.kind === 'build' && a.building).map((a) => a.building));
    const seen = new Set();
    data.districts.forEach((d, i) => {
      if (i >= DISTRICT_SLOTS.length) return;
      seen.add(d.name);
      const lit = working.has(d.name);
      const key = `${d.files}|${d.churn}|${d.dirty}|${lit}|${i}|${this.tier?.id}`;
      const existing = this.buildings.get(d.name);
      if (existing?.key === key) return;
      existing?.view.destroy({ children: true });

      const [bx, by] = DISTRICT_SLOTS[i];
      const view = new Container();
      // A town can't build taller than its tier allows; a camp pitches tents.
      const level = Math.min(levelOf(d), this.tier?.cap ?? 5);
      const art = this.tier?.id === 'camp' && buildingArt.has('tent') ? 'tent' : `district-${level}`;
      const { g, height } = artOr(art, () => districtBuilding(d, { lit, level }));
      view.addChild(g);
      // Art includes its roof, so scaffolding stops at the eaves, about 60% up.
      if (d.dirty > 0) view.addChild(scaffolding(buildingArt.has(art) ? height * 0.6 : height - 10));
      const sign = signboard(districtLabel(d.name));
      sign.position.set(0, 26);
      view.addChild(sign);
      view.eventMode = 'static';
      view.cursor = 'pointer';
      view.on('pointertap', (e) => { e.stopPropagation(); this.onSelect?.({ type: 'district', town: this.id, name: d.name }); });
      this.put(view, bx, by);
      this.buildings.set(d.name, { view, key, index: i, base: view.y });
    });
    for (const [name, b] of this.buildings) {
      if (!seen.has(name)) { b.view.destroy({ children: true }); this.buildings.delete(name); }
    }
    // Empty lots are parks; a lot with a building on it hides its park.
    this.parks.forEach((p, i) => { p.visible = i >= data.districts.length; });
  }

  buildingIndex(name) {
    return this.buildings.get(name)?.index ?? (this.buildings.size ? 0 : -1);
  }

  applyAgents(data, prev) {
    const queues = new Map();
    const seen = new Set();
    for (const a of data.agents) {
      seen.add(a.id);
      const qKey = a.kind === 'build' ? `b:${a.building}` : a.kind;
      const q = queues.get(qKey) ?? 0;
      queues.set(qKey, q + 1);
      let sprite = this.agents.get(a.id);
      const spot = spotFor(a.kind, a.kind === 'build' ? this.buildingIndex(a.building) : -1, q, Boolean(sprite));

      if (!sprite) {
        // Subagents appear at their leader; everyone else arrives through the warp portal.
        const leader = a.leader && this.agents.get(a.leader);
        const spawn = leader ? { ...leader.tile } : { x: CIVIC.warp.x, y: CIVIC.warp.y };
        sprite = new AgentSprite(this, a, spawn);
        this.agents.set(a.id, sprite);
        this.layer.addChild(sprite.view);
        if (prev) {
          this.onEvent?.({ town: data, agent: a, type: 'arrive' });
          sfxAt('warp', this.portal, this.zoom ?? 1, 0.6);
        }
      }
      const before = sprite.data;
      sprite.update(a, spot ?? undefined);
      if (prev && before) this.diffAgent(data, before, a, sprite);
    }
    for (const [id, s] of this.agents) {
      if (!seen.has(id)) { s.destroy(); this.agents.delete(id); }
    }
  }

  /** Turn state changes into chat-log lines and one-off effects. */
  diffAgent(town, before, after, sprite) {
    const newest = after.tools?.[0];
    if (newest && newest.id !== before.tools?.[0]?.id) {
      this.onEvent?.({ town, agent: after, type: 'tool', tool: newest });
    }
    // A tool that just came back as an error.
    for (const t of after.tools ?? []) {
      const old = before.tools?.find((o) => o.id === t.id);
      if (t.error && (!old || !old.error)) {
        sprite.hurt();
        this.onEvent?.({ town, agent: after, type: 'error', tool: t });
        break;
      }
    }
    if (before.kind !== 'waiting' && after.kind === 'waiting' && !after.isParty) {
      this.onEvent?.({ town, agent: after, type: 'waiting' });
    }
    // Once per tool call: a tool still running after LONG_RUN_MS.
    const t = after.tool;
    if (t && !t.done && t.at && Date.now() - Date.parse(t.at) > LONG_RUN_MS && sprite.longRunAlerted !== t.id) {
      sprite.longRunAlerted = t.id;
      this.onEvent?.({ town, agent: after, type: 'longrun', tool: t });
    }
    if (before.hp >= LOW_HP && after.hp < LOW_HP) {
      this.onEvent?.({ town, agent: after, type: 'lowhp' });
    }
  }

  diffCommits(prev, data) {
    const known = new Set(prev.commits.map((c) => c.hash));
    const fresh = data.commits.filter((c) => !known.has(c.hash));
    if (!fresh.length || !prev.commits.length && data.commits.length > 3) return;
    const k = iso(CIVIC.kafra.x, CIVIC.kafra.y);
    this.fx.fireworks(k.x, k.y - 50, k.y + 100);
    this.fx.popText(k.x, k.y - 70, k.y + 100, 'Level Up!', 0xffd54f, 16);
    sfxAt('fanfare', this.kafraNpc, this.zoom ?? 1);
    for (const c of fresh) this.onEvent?.({ town: data, type: 'commit', commit: c });
  }

  shakeBuilding(name) {
    if (name) this.shakes.set(name, 0.12);
  }

  tick(dt, zoom) {
    this.time += dt;
    this.zoom = zoom;
    this.portal.alpha = 0.6 + Math.sin(this.time * 3) * 0.3;
    this.portal.scale.set(1 + Math.sin(this.time * 3) * 0.05);
    const npc = bodyFrame('kafra', 'idle', 's', this.time);
    this.kafraNpc.texture = npc.texture;
    this.kafraNpc.anchor.set(npc.anchor[0], npc.anchor[1]);
    this.kafraNpc.scale.set(npc.scale, npc.scale * (1 + Math.sin(this.time * 2) * 0.02));

    for (const v of this.villagers) v.tick(dt);
    for (const s of this.agents.values()) s.tick(dt, zoom);
    this.declutterBubbles();
    this.tickSky(dt);

    for (const [name, left] of this.shakes) {
      const b = this.buildings.get(name);
      if (!b) { this.shakes.delete(name); continue; }
      const t = left - dt;
      b.view.y = b.base + (t > 0 ? Math.sin(t * 120) * 1 : 0);
      if (t <= 0) this.shakes.delete(name); else this.shakes.set(name, t);
    }

    const crafting = this.data.agents.some((a) => a.kind === 'craft' || a.kind === 'trial');
    this.smokeTimer = (this.smokeTimer ?? 0) + dt;
    if (this.smokeTimer > (crafting ? 0.25 : 1.6)) {
      this.smokeTimer = 0;
      this.fx.smoke(this.chimney.x, this.chimney.y, this.chimney.z, crafting ? 0x9a9a9a : 0xc8c8c8);
    }
    this.fx.update(dt);
  }

  /**
   * Hide speech bubbles that would overlap a more important one. Selected agents
   * win, then working ones, then waiting ones; ties go to whoever is nearer the
   * camera.
   */
  declutterBubbles() {
    const rank = (s) => (s.ring.visible ? 3 : s.data.status === 'active' ? 2 : 1) * 10000 + s.view.y;
    const shown = [];
    const list = [...this.agents.values()].filter((s) => s.bubble.visible && s.bubble.children.length);
    list.sort((a, b) => rank(b) - rank(a));
    for (const s of list) {
      const w = s.bubble.width, h = s.bubble.height;
      const r = { x: s.view.x - w / 2, y: s.view.y + s.bubble.y - h, w, h };
      const hit = shown.some((o) => r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y);
      if (hit) s.bubble.visible = false;
      else shown.push(r);
    }
  }

  /** Apply time of day, rain and drifting clouds. `this.sky` is set by the city each frame. */
  tickSky(dt) {
    const sky = this.sky ?? { tint: 0xffffff, glow: 0 };
    const storm = this.data && isStormy(this.data);
    const base = mixTint(sky.tint, moodTint(this.mood));
    const tint = storm ? mixTint(base, 0xa8b0c0) : base;
    this.ground.tint = tint;
    this.layer.tint = tint;
    this.glow.alpha = Math.max(sky.glow, storm ? 0.5 : 0);
    this.glow.visible = this.glow.alpha > 0.02;

    const span = SIZE * TW;
    for (const c of this.clouds.children) {
      c.x += c.speed * dt * (storm ? 3 : 1);
      if (c.x > span / 2 + 150) c.x = -span / 2 - 150;
      c.alpha = storm ? 1 : 0.35;
    }

    if (storm) {
      this.rainTimer = (this.rainTimer ?? 0) + dt;
      while (this.rainTimer > 0.012) {
        this.rainTimer -= 0.012;
        const x = (Math.random() - 0.5) * span;
        const y = Math.random() * SIZE * TH - 120;
        this.fx.particle({
          x, y, z: 99999, vx: -40, vy: 320, life: 0.35,
          draw: (g) => g.moveTo(0, 0).lineTo(-2, 8).stroke({ width: 1, color: 0xc8d8f0, alpha: 0.7 }),
        });
      }
    }
  }

  agent(id) { return this.agents.get(id); }

  destroy() { this.view.destroy({ children: true }); }
}
