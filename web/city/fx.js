/**
 * Short-lived effects: sparks, smoke, pages, damage numbers, fireworks.
 *
 * One pool per town layer. Particles are plain Graphics updated by hand; at the
 * counts a few agents produce, a particle engine would be more code than this.
 */
import { Graphics, Text } from '/vendor/pixi.mjs';

export class Fx {
  constructor(layer) {
    this.layer = layer;
    this.items = [];
  }

  /** Generic particle: velocity in px/s, gravity in px/s², life in seconds. */
  particle({ x, y, vx = 0, vy = 0, gravity = 0, life = 0.8, draw, z = 0, fade = true, grow = 0 }) {
    const g = draw(new Graphics());
    g.position.set(x, y);
    g.zIndex = z;
    this.layer.addChild(g);
    this.items.push({ g, vx, vy, gravity, life, age: 0, fade, grow });
  }

  sparks(x, y, z) {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = 40 + Math.random() * 60;
      this.particle({
        x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, gravity: 160, life: 0.45,
        draw: (g) => g.rect(-1, -1, 2, 2).fill(Math.random() < 0.5 ? 0xffd54f : 0xffffff),
      });
    }
  }

  smoke(x, y, z, color = 0xb0b0b0) {
    this.particle({
      x: x + (Math.random() - 0.5) * 4, y, z, vx: 6 + Math.random() * 6, vy: -18, life: 1.8, grow: 0.8,
      draw: (g) => g.circle(0, 0, 3).fill({ color, alpha: 0.6 }),
    });
  }

  page(x, y, z) {
    this.particle({
      x, y, z, vx: (Math.random() - 0.5) * 20, vy: -22, life: 1.2,
      draw: (g) => g.rect(-2, -2, 4, 3).fill(0xfff8e6).stroke({ width: 0.5, color: 0x998866 }),
    });
  }

  mote(x, y, z, color) {
    this.particle({
      x: x + (Math.random() - 0.5) * 22, y: y + (Math.random() - 0.5) * 8, z,
      vy: -30 - Math.random() * 20, life: 1,
      draw: (g) => g.rect(-1, -1, 2, 2).fill(color),
    });
  }

  /** RO-style popping number or word. */
  popText(x, y, z, text, color = 0xffffff, size = 12) {
    this.particle({
      x, y, z, vx: (Math.random() - 0.5) * 20, vy: -60, gravity: 90, life: 1.1,
      draw: (g) => {
        const t = new Text({
          text,
          style: { fontFamily: 'Verdana, sans-serif', fontSize: size, fontWeight: 'bold', fill: color, stroke: { color: 0x1a1206, width: 3 } },
          resolution: Math.max(2, window.devicePixelRatio * 2),
        });
        t.anchor.set(0.5);
        g.addChild(t);
        return g;
      },
    });
  }

  fireworks(x, y, z) {
    const colors = [0xffd54f, 0xff7675, 0x74b9ff, 0x55efc4, 0xffffff];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const v = 50 + Math.random() * 50;
      const color = colors[i % colors.length];
      this.particle({
        x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 40, gravity: 50, life: 1.4,
        draw: (g) => g.rect(-1.5, -1.5, 3, 3).fill(color),
      });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.g.destroy({ children: true });
        this.items.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      const t = p.age / p.life;
      if (p.fade) p.g.alpha = 1 - t * t;
      if (p.grow) p.g.scale.set(1 + p.grow * t * 2);
    }
  }
}
