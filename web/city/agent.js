/**
 * One agent in the city: walks to where its work is and acts it out.
 *
 * The server says *what* the agent is doing (a kind and a target); everything
 * here is about making that legible at a glance — a hammer at a building means
 * it is writing files there, a book at the library means it is reading.
 */
import { Container, Sprite, Graphics, Text } from '/vendor/pixi.mjs';
import { itemGraphic, label, CLASSES } from './art.js';
import { bodyFrame, animates } from './skin.js';
import { iconFor } from './assets.js';
import { STATUS, statusOf } from './status.js';
import { sfxAt } from './audio.js';

/**
 * Ambient sound per activity, as [sound, seconds between, loudness]. Hammer
 * and sword sounds aren't here: they play on the swing's impact instead.
 */
const AMBIENT = {
  research: ['page', 1.4, 0.8],
  craft: ['bubble', 1.1, 0.8],
  deliver: ['coin', 1.8, 0.7],
  teleport: ['warp', 2.4, 0.8],
  summon: ['summon', 2.6, 0.8],
  cast: ['shimmer', 3.2, 0.6],
};
import { iso, route } from './layout.js';

const WALK_TILES_PER_S = 3.2;

const EMOTE = { waiting: '!', ask: '?', cast: '…', resting: 'z' };
const EMOTE_COLOR = { waiting: 0xffd54f, ask: 0x74b9ff, cast: 0xffffff, resting: 0xa0d8ff };
const SITTING = new Set(['idle', 'resting']);

const KIND_ICON = {
  build: '⚒', research: '📖', craft: '⚗', trial: '⚔', deliver: '📦',
  teleport: '✦', summon: '✧', ask: '?', cast: '…', waiting: '!',
};

const basename = (p) => String(p ?? '').split('/').filter(Boolean).pop() ?? '';

/** What the speech bubble says, without its icon; null means no bubble. */
function bubbleText(a) {
  if (a.status !== 'active' && a.kind !== 'waiting' && a.kind !== 'ask') return null;
  if (a.kind === 'waiting') return 'Giliranmu!';
  if (a.kind === 'cast') return 'berpikir…';
  const target = a.file ? basename(a.file) : a.tool?.label;
  return target ? target.slice(0, 34) : '';
}

export class AgentSprite {
  constructor(town, data, spawnAt) {
    this.town = town;
    this.data = data;
    this.tile = { ...spawnAt };
    this.path = [];
    this.target = { ...spawnAt };
    this.phase = Math.random();
    this.fxTimer = 0;
    this.walkTimer = 0;
    this.lastSwing = 0;
    this.facing = 1;
    this.heading = 's';

    const c = (this.view = new Container());
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', (e) => { e.stopPropagation(); town.onSelect?.({ type: 'agent', id: data.id }); });

    // Selection: a white ring outside the status ring.
    this.ring = new Graphics().ellipse(0, 0, 19, 9.5).stroke({ width: 2, color: 0xffffff });
    this.ring.visible = false;
    this.shadow = new Graphics().ellipse(0, 0, 9, 4).fill({ color: 0x000000, alpha: 0.3 });
    // Status ring: what sets an agent apart from townsfolk, and its state at a glance.
    this.statusRing = new Graphics();

    // Shown instead of the bubble when zoomed out: status-coloured disc with the activity icon.
    this.badge = new Container();
    this.badge.y = -46;
    this.badge.visible = false;

    // Magic circle, squashed into the ground plane; the inner graphic spins.
    this.circleWrap = new Container();
    this.circleWrap.scale.y = 0.5;
    this.circle = new Graphics();
    this.circleWrap.addChild(this.circle);
    this.circleWrap.visible = false;

    this.pillar = new Graphics().rect(-10, -90, 20, 90).fill({ color: 0xa0d8ff, alpha: 0.35 });
    this.pillar.visible = false;

    this.body = new Sprite();

    this.hand = new Container();
    this.hand.position.set(9, -16);

    this.emote = new Text({
      text: '',
      style: { fontFamily: 'Verdana, sans-serif', fontSize: 16, fontWeight: 'bold', fill: 0xffffff, stroke: { color: 0x1a1206, width: 4 } },
      resolution: Math.max(2, window.devicePixelRatio * 2),
    });
    this.emote.anchor.set(0.5, 1);
    this.emote.y = -38;

    this.bubble = new Container();
    this.bubble.y = -40;

    this.nameTag = label('', { size: 9 });
    this.nameTag.y = 6;
    this.titleTag = label('', { size: 8, color: 0xffe08a, weight: 'normal' });
    this.titleTag.y = 18;
    this.hp = new Graphics();
    this.hp.y = 3;

    c.addChild(this.ring, this.statusRing, this.shadow, this.circleWrap, this.pillar, this.body, this.hand, this.emote, this.bubble, this.badge, this.hp, this.nameTag, this.titleTag);
    c.hitArea = { contains: (x, y) => x > -14 && x < 14 && y > -34 && y < 30 };

    this.update(data);
    this.place();
  }

  /** New data from the server. Only re-route when the destination actually moved. */
  update(data, spot) {
    const prev = this.data;
    this.data = data;

    if (spot && (Math.abs(spot.x - this.target.x) > 0.01 || Math.abs(spot.y - this.target.y) > 0.01)) {
      this.target = { ...spot };
      this.path = route(this.tile, spot);
    }

    if (!prev || prev.kind !== data.kind || this.item === undefined) this.setItem(data.kind);

    this.nameTag.text = data.isParty ? `${data.agentType ?? 'party'}` : data.job;
    this.titleTag.text = (data.title || '').slice(0, 30);
    this.drawHp(data.hp);
    this.drawBubble(data.kind, bubbleText(data));
    this.emote.text = EMOTE[data.kind] ?? '';
    this.emote.style.fill = EMOTE_COLOR[data.kind] ?? 0xffffff;
    this.drawCircle(data.kind);
    this.pillar.visible = data.kind === 'teleport';
    this.view.alpha = data.status === 'resting' ? 0.75 : 1;
    this.drawStatus(statusOf(data), data.kind);
  }

  drawStatus(status, kind) {
    const key = `${status}|${kind}`;
    if (this.statusKey === key) return;
    this.statusKey = key;
    this.status = status;
    const { color } = STATUS[status];
    this.statusRing.clear()
      .ellipse(0, 0, 14, 7).fill({ color, alpha: 0.18 })
      .ellipse(0, 0, 14, 7).stroke({ width: 2, color });

    this.badge.removeChildren().forEach((ch) => ch.destroy());
    const disc = new Graphics().circle(0, 0, 10).fill(0x1a1206).circle(0, 0, 10).stroke({ width: 2.5, color });
    this.badge.addChild(disc);
    const art = iconFor(kind);
    if (art) {
      const s = new Sprite(art.texture);
      s.anchor.set(0.5);
      s.width = s.height = 14;
      this.badge.addChild(s);
    } else {
      const t = new Text({ text: status === 'waiting' ? '!' : KIND_ICON[kind] ?? '•', style: { fontSize: 11, fill: 0xffffff, fontWeight: 'bold' }, resolution: 3 });
      t.anchor.set(0.5);
      this.badge.addChild(t);
    }
  }

  setItem(kind) {
    this.hand.removeChildren().forEach((ch) => ch.destroy());
    this.item = itemGraphic(kind);
    if (this.item) this.hand.addChild(this.item);
  }

  drawHp(hp) {
    const w = 30;
    const color = hp <= 20 ? 0xc03028 : hp <= 50 ? 0xd8b020 : 0x5cc030;
    this.hp.clear()
      .rect(-w / 2 - 1, -1, w + 2, 5).fill(0x1a1206)
      .rect(-w / 2, 0, w, 3).fill(0x3a2820)
      .rect(-w / 2, 0, (w * hp) / 100, 3).fill(color);
  }

  /** Speech bubble: the activity's icon (art if loaded, else a glyph) and a short label. */
  drawBubble(kind, text) {
    const key = `${kind}|${text}`;
    if (this.bubbleKey === key) return;
    this.bubbleKey = key;
    this.bubble.removeChildren().forEach((ch) => ch.destroy());
    if (text === null) return;

    const art = iconFor(kind);
    const glyph = art ? '' : `${KIND_ICON[kind] ?? '•'} `;
    const t = new Text({
      text: `${glyph}${text}`.trim(),
      style: { fontFamily: 'Verdana, sans-serif', fontSize: 9, fill: 0x2e2416 },
      resolution: Math.max(2, window.devicePixelRatio * 2),
    });
    const ICON = 13;
    const iconW = art ? ICON + (t.text ? 3 : 0) : 0;
    const w = t.width + iconW + 10, h = Math.max(t.height, art ? ICON : 0) + 6;
    const g = new Graphics()
      .roundRect(-w / 2, -h - 2, w, h, 4).fill(0xfff8e6).stroke({ width: 1, color: 0x8b7355 })
      .poly([-3, -2, 3, -2, 0, 3]).fill(0xfff8e6);
    this.bubble.addChild(g);
    if (art) {
      const s = new Sprite(art.texture);
      s.width = s.height = ICON;
      s.position.set(-w / 2 + 5, -h - 2 + (h - ICON) / 2);
      this.bubble.addChild(s);
    }
    t.anchor.set(0, 0.5);
    t.position.set(-w / 2 + 5 + iconW, -2 - h / 2);
    this.bubble.addChild(t);
  }

  drawCircle(kind) {
    const color = { summon: 0xb388ff, cast: 0x80deea, teleport: 0xa0d8ff }[kind];
    this.circleWrap.visible = Boolean(color);
    if (!color || this.circleColor === color) return;
    this.circleColor = color;
    const r = kind === 'cast' ? 16 : 22;
    const g = this.circle.clear();
    g.circle(0, 0, r).stroke({ width: 2, color, alpha: 0.9 });
    g.circle(0, 0, r - 5).stroke({ width: 1, color, alpha: 0.7 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.rect(Math.cos(a) * (r - 2.5) - 1.5, Math.sin(a) * (r - 2.5) - 1.5, 3, 3).fill(color);
    }
    g.poly([0, -(r - 5), (r - 5) * 0.87, (r - 5) * 0.5, -(r - 5) * 0.87, (r - 5) * 0.5]).stroke({ width: 1, color, alpha: 0.6 });
  }

  setSelected(on) { this.ring.visible = on; }

  place() {
    const p = iso(this.tile.x, this.tile.y);
    this.view.position.set(p.x, p.y);
    this.view.zIndex = p.y;
  }

  /** Advance one frame. `zoom` hides small text when the camera is far out. */
  tick(dt, zoom) {
    const d = this.data;
    this.phase += dt;
    this.fxTimer += dt;
    this.zoom = zoom;

    const moving = this.walk(dt);
    const sitting = !moving && SITTING.has(d.kind);
    if (!moving) {
      // Builders face their building (west of the spot), fighters the arena (east).
      this.heading = d.kind === 'build' ? 'w' : d.kind === 'trial' ? 'e' : 's';
      this.facing = this.heading === 'w' ? -1 : 1;
    }
    const anim = moving ? 'walk' : sitting ? 'sit' : d.kind === 'waiting' || d.kind === 'ask' ? 'idle' : d.kind;
    const f = bodyFrame(d.sprite, anim, this.heading, moving ? this.walkTimer : this.phase);
    this.body.texture = f.texture;
    this.body.tint = f.tint;
    this.body.anchor.set(f.anchor[0], f.anchor[1]);
    // Breathing while still: a 2% squash is enough to read as alive.
    const breath = moving ? 1 : 1 + Math.sin(this.phase * 2.4) * 0.02;
    this.body.scale.set(f.scale * (f.flip ? -1 : 1), f.scale * breath);
    this.body.y = moving ? -Math.abs(Math.sin(this.phase * 12)) * 2 : 0;
    // When the sheet animates the activity itself, the drawn prop would double up.
    this.hand.visible = !sitting && Boolean(this.item) && !animates(d.sprite, anim) && this.heading !== 'n';
    this.hand.x = 9 * this.facing;
    this.hand.scale.x = this.facing;

    if (this.circleWrap.visible) this.circle.rotation += dt * (d.kind === 'cast' ? 1.2 : 2.2);
    if (this.pillar.visible) this.pillar.alpha = 0.4 + Math.sin(this.phase * 5) * 0.25;
    this.emote.y = -38 - Math.abs(Math.sin(this.phase * 3)) * 4 - (this.bubble.children.length ? 18 : 0);
    if (d.kind === 'resting') this.emote.alpha = 0.5 + Math.sin(this.phase * 1.5) * 0.5;
    else this.emote.alpha = 1;

    const showText = zoom > 0.75;
    this.bubble.visible = showText && !moving;
    // Far out, the badge replaces the bubble and grows against the zoom so it stays readable.
    this.badge.visible = !showText && this.status !== 'idle';
    if (this.badge.visible) this.badge.scale.set(Math.min(3, 0.8 / zoom));
    // Waiting and errors pulse: those are the states that need a person.
    const urgent = this.status === 'waiting' || this.status === 'error';
    this.statusRing.alpha = urgent ? 0.55 + Math.sin(this.phase * 6) * 0.45 : 1;
    this.statusRing.scale.set(urgent ? 1 + Math.sin(this.phase * 6) * 0.08 : 1);
    this.nameTag.visible = showText;
    this.titleTag.visible = showText && (zoom > 1.6 || this.ring.visible);

    if (!moving) this.act(dt);
    else if (this.item) this.item.rotation = Math.sin(this.phase * 10) * 0.2;
  }

  walk(dt) {
    if (!this.path.length) return false;
    const next = this.path[0];
    const dx = next.x - this.tile.x, dy = next.y - this.tile.y;
    const dist = Math.hypot(dx, dy);
    const step = WALK_TILES_PER_S * dt;
    this.walkTimer += dt;
    if (dist <= step) {
      this.tile = { ...next };
      this.path.shift();
    } else {
      this.tile.x += (dx / dist) * step;
      this.tile.y += (dy / dist) * step;
    }
    // Screen-space direction: x grows with (dx - dy), y with (dx + dy).
    // Walking up the screen shows the back; anything else shows the side.
    const sx = dx - dy, sy = dx + dy;
    if (Math.abs(sx) > 0.01) this.facing = sx > 0 ? 1 : -1;
    this.heading = sy < -0.01 ? 'n' : this.facing > 0 ? 'e' : 'w';
    this.place();
    return true;
  }

  /** Per-kind animation once the agent has arrived. */
  act(dt) {
    const d = this.data;
    const fx = this.town.fx;
    const { x, y } = this.view.position;
    const z = this.view.zIndex + 1;
    const item = this.item;

    const ambient = AMBIENT[d.kind];
    this.sfxTimer = (this.sfxTimer ?? Math.random()) + dt;
    if (ambient && this.sfxTimer > ambient[1]) {
      this.sfxTimer = 0;
      sfxAt(ambient[0], this.view, this.zoom, ambient[2]);
    }

    switch (d.kind) {
      case 'build':
      case 'trial': {
        // Swing: wind up slowly, strike fast. With a drawn hammer the strike ends
        // each cycle; an animated sheet strikes on its 7th of 8 frames (8 fps),
        // so effects are shifted to land with it.
        const sheet = animates(d.sprite, d.kind) && d.kind === 'build';
        const period = sheet ? 1 : d.kind === 'build' ? 0.55 : 0.7;
        const offset = sheet ? 0.25 : 0;
        const t = (this.phase % period) / period;
        if (item) item.rotation = t < 0.75 ? -1.4 * (t / 0.75) : -1.4 + 2.2 * ((t - 0.75) / 0.25);
        const cycle = Math.floor((this.phase + offset) / period);
        if (cycle !== this.lastSwing) {
          this.lastSwing = cycle;
          const hx = x + 16 * this.facing;
          if (d.kind === 'build') {
            fx.sparks(hx, y - 10, z);
            sfxAt('hammer', this.view, this.zoom);
            this.town.shakeBuilding(d.building);
          } else if (Math.random() < 0.7) {
            fx.popText(hx + 14 * this.facing, y - 30, z, String(Math.floor(40 + Math.random() * 900)));
            sfxAt('slash', this.view, this.zoom);
          }
        }
        break;
      }
      case 'research':
        if (item) item.rotation = Math.sin(this.phase * 2) * 0.08;
        if (this.fxTimer > 0.5) { this.fxTimer = 0; fx.page(x + 8 * this.facing, y - 20, z); }
        break;
      case 'craft':
        if (item) item.rotation = Math.sin(this.phase * 6) * 0.5;
        if (this.fxTimer > 0.3) { this.fxTimer = 0; fx.smoke(x + 10 * this.facing, y - 28, z, Math.random() < 0.5 ? 0x55efc4 : 0xb0b0b0); }
        break;
      case 'deliver':
        if (item) { item.rotation = 0; item.y = -8 + Math.sin(this.phase * 4) * 1.5; }
        if (this.fxTimer > 0.4) { this.fxTimer = 0; fx.mote(x, y - 20, z, 0xffd54f); }
        break;
      case 'teleport':
        this.body.alpha = 0.6 + Math.sin(this.phase * 14) * 0.4;
        if (this.fxTimer > 0.08) { this.fxTimer = 0; fx.mote(x, y - 4, z, 0xa0d8ff); }
        return;
      case 'summon':
        if (this.fxTimer > 0.12) { this.fxTimer = 0; fx.mote(x, y - 4, z, 0xb388ff); }
        if (item) item.rotation = -0.3 + Math.sin(this.phase * 3) * 0.2;
        break;
      case 'cast':
        if (item) item.rotation = -0.2 + Math.sin(this.phase * 2) * 0.1;
        if (this.fxTimer > 0.25) { this.fxTimer = 0; fx.mote(x, y - 2, z, 0x80deea); }
        break;
      default:
        break;
    }
    this.body.alpha = 1;
  }

  /** One-off reactions to events the town spots by diffing server states. */
  hurt() {
    this.town.fx.popText(this.view.x, this.view.y - 40, this.view.zIndex + 1, 'Miss', 0xff5252, 13);
    sfxAt('miss', this.view, this.zoom ?? 1);
  }

  accent() { return CLASSES[this.data.sprite]?.accent ?? 0xffffff; }

  destroy() { this.view.destroy({ children: true }); }
}
