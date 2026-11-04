/**
 * A bug in the arena: one per agent whose latest test run failed.
 *
 * Generated art per failure streak (`bug1`…`bug3` in the decor manifest), or a
 * beetle drawn in code when that art isn't installed. It faces the fighters on
 * the west side of the arena, grows meaner with each failure in a row, flinches
 * when its agent swings, and bursts when a test run passes.
 */
import { Container, Graphics, Sprite } from '/vendor/pixi.mjs';
import { label } from './art.js';
import { decorArt } from './assets.js';
import { iso } from './layout.js';
import { t } from './i18n.js';

/** Body colour by failures in a row: yellow, orange, then red for a stubborn one. */
const COLORS = [0xffca28, 0xff7043, 0xd32f2f];
const OUTLINE = 0x1a1206;

/**
 * Tiles bugs stand on: the arena's front-right, in front of a camp's tent and
 * clear of the fighters' name labels on the west side (layout.js SPOTS.trial).
 */
export const BUG_SLOTS = [[19.2, 17.8], [19.5, 18.9], [20, 17], [20.3, 18.1], [19.7, 19.9], [20.5, 19.1]];

function drawBug(g, color) {
  g.clear();
  // Six legs.
  for (const x of [-6, 0, 6]) {
    g.moveTo(x, -4).lineTo(x - 3, 0).stroke({ width: 1.5, color: OUTLINE });
    g.moveTo(x, -4).lineTo(x + 3, 0).stroke({ width: 1.5, color: OUTLINE });
  }
  // Shell, split down the middle, with spots.
  g.ellipse(0, -9, 11, 8).fill(color).stroke({ width: 1.5, color: OUTLINE });
  g.moveTo(1, -16.5).lineTo(1, -1.5).stroke({ width: 1, color: OUTLINE, alpha: 0.7 });
  for (const [x, y] of [[-4, -11], [6, -10], [4, -5]]) g.circle(x, y, 1.6).fill({ color: OUTLINE, alpha: 0.45 });
  g.ellipse(-3, -13, 4, 2).fill({ color: 0xffffff, alpha: 0.35 });
  // Head on the west side, facing the fighters; eyes and antennae.
  g.circle(-10, -8, 5).fill(0x3a2e24).stroke({ width: 1.5, color: OUTLINE });
  for (const y of [-10, -6.5]) g.circle(-12, y, 1.7).fill(0xffffff).circle(-12.6, y, 0.9).fill(0x000000);
  g.moveTo(-12, -12).quadraticCurveTo(-16, -18, -19, -17).stroke({ width: 1, color: OUTLINE });
  g.moveTo(-10, -12.5).quadraticCurveTo(-12, -20, -15, -21).stroke({ width: 1, color: OUTLINE });
  g.circle(-19, -17, 1.2).fill(color).circle(-15, -21, 1.2).fill(color);
  return g;
}

export class Monster {
  constructor(town, slot, bug, { appear = true } = {}) {
    this.town = town;
    this.slot = slot;
    this.agentId = bug.agent.id;
    this.time = Math.random() * 10;
    this.flash = 0;
    this.knock = 0;
    this.grow = appear ? 0 : 1;
    this.leaving = null;
    this.leftFor = 0;

    this.view = new Container();
    this.view.addChild(new Graphics().ellipse(0, 0, 12, 4).fill({ color: 0x000000, alpha: 0.28 }));
    this.body = new Container();
    this.look = new Container();
    this.body.addChild(this.look);
    this.view.addChild(this.body);
    this.tag = new Container();
    this.view.addChild(this.tag);

    // Clicking the bug selects the agent fighting it.
    this.view.eventMode = 'static';
    this.view.cursor = 'pointer';
    this.view.on('pointertap', (e) => { e.stopPropagation(); town.onSelect?.({ type: 'agent', id: this.agentId }); });

    const [x, y] = BUG_SLOTS[slot];
    const p = iso(x, y);
    this.view.position.set(p.x, p.y);
    this.view.zIndex = p.y;
    this.home = { x: p.x, y: p.y };
    this.update(bug);
  }

  update(bug) {
    const level = Math.min(bug.streak, COLORS.length);
    if (level === this.level) return;
    this.level = level;
    this.look.removeChildren().forEach((c) => c.destroy());
    const art = decorArt.get(`bug${level}`);
    if (art) {
      // Generated art is already sized per level by the manifest.
      const sprite = new Sprite(art.texture);
      sprite.anchor.set(art.anchor[0], art.anchor[1]);
      sprite.scale.set(art.scale * (art.flip ? -1 : 1), art.scale);
      this.look.addChild(sprite);
      this.size = 1;
      this.top = art.height ?? sprite.height;
    } else {
      this.look.addChild(drawBug(new Graphics(), COLORS[level - 1]));
      this.size = 1.25 + 0.2 * (level - 1);
      this.top = this.look.height * this.size;
    }
    this.tag.removeChildren().forEach((c) => c.destroy());
    const name = label(t('bug.name', { n: bug.streak }), { size: 8, color: level >= 3 ? 0xff8a80 : 0xffe0b2 });
    name.position.set(0, -this.top - 14);
    this.tag.addChild(name);
  }

  /** Hit by its agent's swing. */
  flinch() {
    if (this.leaving) return;
    this.flash = 0.12;
    this.knock = 1;
  }

  /** Start leaving: 'slain' bursts in place, 'fled' scuttles off east. */
  leave(how) {
    this.leaving = how;
    this.leftFor = 0;
    if (how === 'slain') {
      const { x, y } = this.view.position;
      this.town.fx.sparks(x, y - 10, this.view.zIndex + 1);
      this.town.fx.sparks(x, y - 14, this.view.zIndex + 1);
      this.town.fx.popText(x, y - 36, this.view.zIndex + 2, t('bug.clear'), 0xffd54f, 13);
    }
  }

  /** False once it has finished leaving and can be destroyed. */
  tick(dt) {
    this.time += dt;
    this.grow = Math.min(1, this.grow + dt * 3);
    this.flash = Math.max(0, this.flash - dt);
    this.knock = Math.max(0, this.knock - dt * 6);

    // A slow hop, squashing as it lands.
    const hop = Math.abs(Math.sin(this.time * 3));
    let sx = this.size * this.grow * (1 + (1 - hop) * 0.08);
    let sy = this.size * this.grow * (1 - (1 - hop) * 0.08);
    this.body.y = -hop * 3;
    this.body.x = this.knock * 4;
    this.look.tint = this.flash > 0 ? 0xff6060 : 0xffffff;

    if (this.leaving) {
      this.leftFor += dt;
      const k = this.leftFor / (this.leaving === 'slain' ? 0.35 : 1.2);
      if (this.leaving === 'slain') { sx *= 1 + k; sy *= 1 - k * 0.6; }
      else this.view.x = this.home.x + this.leftFor * 40;
      this.view.alpha = Math.max(0, 1 - k);
      this.tag.visible = false;
      if (k >= 1) return false;
    }
    this.body.scale.set(sx, sy);
    return true;
  }

  destroy() { this.view.destroy({ children: true }); }
}
