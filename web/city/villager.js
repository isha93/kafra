/**
 * Townsfolk. They are not agents and carry no data — they wander the roads so
 * a quiet town still looks lived in, the way SimCity fills streets with cars.
 */
import { Container, Sprite, Graphics } from '../vendor/pixi.mjs';
import { bodyFrame } from './skin.js';
import { iso, route, ROADS } from './layout.js';

const SPEED = 1.4; // tiles per second, slower than agents: they have nowhere to be

export class Villager {
  constructor(cls, rand) {
    this.cls = cls;
    this.rand = rand;
    this.tile = this.randomStop();
    this.path = [];
    this.wait = rand() * 3;
    this.t = rand() * 10;
    this.heading = 's';

    this.view = new Container();
    this.view.addChild(new Graphics().ellipse(0, 0, 8, 3.5).fill({ color: 0x000000, alpha: 0.25 }));
    this.body = new Sprite();
    this.body.tint = 0xc8c0b0;
    this.view.alpha = 0.85;
    this.view.addChild(this.body);
    this.place();
  }

  /** A random point on the road grid. */
  randomStop() {
    const road = ROADS[Math.floor(this.rand() * ROADS.length)];
    const along = 1 + Math.floor(this.rand() * 19);
    return this.rand() < 0.5 ? { x: road, y: along } : { x: along, y: road };
  }

  place() {
    const p = iso(this.tile.x, this.tile.y);
    this.view.position.set(p.x, p.y);
    this.view.zIndex = p.y;
  }

  tick(dt) {
    this.t += dt;
    let moving = false;
    if (this.path.length) {
      const next = this.path[0];
      const dx = next.x - this.tile.x, dy = next.y - this.tile.y;
      const dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (dist <= step) { this.tile = { ...next }; this.path.shift(); }
      else { this.tile.x += (dx / dist) * step; this.tile.y += (dy / dist) * step; }
      const sx = dx - dy;
      this.heading = dx + dy < -0.01 ? 'n' : sx >= 0 ? 'e' : 'w';
      this.place();
      moving = true;
      if (!this.path.length) this.wait = 1.5 + this.rand() * 5;
    } else if ((this.wait -= dt) <= 0) {
      this.path = route(this.tile, this.randomStop());
    }
    const f = bodyFrame(this.cls, moving ? 'walk' : 'idle', moving ? this.heading : 's', this.t);
    this.body.texture = f.texture;
    this.body.anchor.set(f.anchor[0], f.anchor[1]);
    // Townsfolk are scenery: smaller and muted, so agents read as the cast.
    this.body.scale.set(f.scale * 0.7 * (f.flip ? -1 : 1), f.scale * 0.7);
    this.body.y = moving ? -Math.abs(Math.sin(this.t * 9)) * 1.5 : 0;
  }
}
