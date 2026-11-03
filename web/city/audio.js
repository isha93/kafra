/**
 * Sound for the city, synthesised with Web Audio: no files, nothing fetched.
 *
 * Two independent switches: effects (agents at work, alerts) and music (a
 * small generated chiptune that follows the town on screen). Both start off;
 * browsers only allow audio after a click, and the toggles are that click.
 *
 * Effects are positional: an agent on the left of the screen sounds on the
 * left, and agents far from the centre, off screen, or seen from the world
 * map are quieter or silent. Nothing here imitates Ragnarok's music.
 */

let ctx = null;
let master, sfxBus, musicBus;
let app = null;
const state = { sfx: false, music: false };

/** Lazily create the audio graph; must be called from a user gesture the first time. */
function graph() {
  if (ctx) return ctx;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.9;
  // A gentle limiter so overlapping hammers never clip.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.ratio.value = 6;
  master.connect(limiter).connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.55;
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.0;
  sfxBus.connect(master);
  musicBus.connect(master);
  return ctx;
}

export function bindStage(pixiApp) { app = pixiApp; }

export function setSfx(on) {
  state.sfx = on;
  if (on) graph().resume();
}

export function setMusic(on) {
  state.music = on;
  if (on) {
    graph().resume();
    music.start();
  }
  if (ctx) musicBus.gain.setTargetAtTime(on ? 0.16 : 0, ctx.currentTime, 0.6);
}

/* ── Building blocks ────────────────────────────────────────────────────── */

let noiseBuffer = null;
function noise() {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer;
  return s;
}

/** Gain envelope: quick attack, exponential decay. */
function env(t0, peak, decay, attack = 0.005) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}

function tone(out, { type = 'sine', f, f2, t0, peak, decay, attack }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + (attack ?? 0.005) + decay);
  const g = env(t0, peak, decay, attack);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + (attack ?? 0.005) + decay + 0.05);
}

function hiss(out, { t0, peak, decay, type = 'bandpass', f = 2000, f2, q = 1, attack }) {
  const s = noise();
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(f, t0);
  if (f2) filter.frequency.exponentialRampToValueAtTime(f2, t0 + decay);
  filter.Q.value = q;
  const g = env(t0, peak, decay, attack);
  s.connect(filter).connect(g).connect(out);
  s.start(t0, Math.random() * 0.5);
  s.stop(t0 + decay + 0.1);
}

/* ── Effects ────────────────────────────────────────────────────────────── */

const SOUNDS = {
  hammer(out, t) {
    // Metal on metal: a bright ping over a short thud.
    tone(out, { type: 'triangle', f: 1240 + Math.random() * 120, t0: t, peak: 0.5, decay: 0.18 });
    tone(out, { type: 'square', f: 2480, t0: t, peak: 0.08, decay: 0.06 });
    hiss(out, { t0: t, peak: 0.35, decay: 0.05, f: 3200, q: 2 });
  },
  page(out, t) {
    hiss(out, { t0: t, peak: 0.22, decay: 0.16, type: 'highpass', f: 2500, attack: 0.04 });
  },
  bubble(out, t) {
    for (let i = 0; i < 2; i++) {
      tone(out, { f: 380 + Math.random() * 160, f2: 900 + Math.random() * 300, t0: t + i * 0.09, peak: 0.25, decay: 0.07 });
    }
  },
  slash(out, t) {
    hiss(out, { t0: t, peak: 0.4, decay: 0.13, f: 900, f2: 4200, q: 1.5, attack: 0.01 });
  },
  miss(out, t) {
    tone(out, { type: 'square', f: 300, f2: 140, t0: t, peak: 0.18, decay: 0.22 });
  },
  coin(out, t) {
    tone(out, { type: 'square', f: 988, t0: t, peak: 0.14, decay: 0.07 });
    tone(out, { type: 'square', f: 1319, t0: t + 0.07, peak: 0.14, decay: 0.22 });
  },
  warp(out, t) {
    tone(out, { f: 300, f2: 1400, t0: t, peak: 0.22, decay: 0.55, attack: 0.08 });
    tone(out, { type: 'triangle', f: 600, f2: 2400, t0: t + 0.05, peak: 0.08, decay: 0.5, attack: 0.1 });
  },
  summon(out, t) {
    [523, 659, 784, 1047].forEach((f, i) => tone(out, { type: 'triangle', f, t0: t + i * 0.07, peak: 0.16, decay: 0.3 }));
  },
  shimmer(out, t) {
    tone(out, { f: 1568, t0: t, peak: 0.06, decay: 0.6, attack: 0.05 });
    tone(out, { f: 2093, t0: t + 0.08, peak: 0.04, decay: 0.5, attack: 0.05 });
  },
  fanfare(out, t) {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(out, { type: 'square', f, t0: t + i * 0.09, peak: 0.12, decay: i === 5 ? 0.5 : 0.1 }));
    for (let i = 0; i < 4; i++) hiss(out, { t0: t + 0.3 + i * 0.12, peak: 0.25, decay: 0.2, type: 'lowpass', f: 900 });
  },
  chimeUp(out, t) {
    tone(out, { type: 'triangle', f: 660, t0: t, peak: 0.3, decay: 0.3 });
    tone(out, { type: 'triangle', f: 880, t0: t + 0.14, peak: 0.3, decay: 0.35 });
  },
  chimeDown(out, t) {
    tone(out, { type: 'triangle', f: 440, t0: t, peak: 0.3, decay: 0.3 });
    tone(out, { type: 'triangle', f: 330, t0: t + 0.14, peak: 0.3, decay: 0.35 });
  },
};

/** Per-sound cooldown, so ten builders don't become a wall of noise. */
const last = new Map();
const COOLDOWN = { hammer: 0.09, page: 0.25, bubble: 0.3, slash: 0.12, coin: 0.4, warp: 0.6, summon: 0.8, shimmer: 1.2, fanfare: 1, miss: 0.2 };

function play(name, gain = 1, pan = 0) {
  if (!ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (t - (last.get(name) ?? -9) < (COOLDOWN[name] ?? 0.1)) return;
  last.set(name, t);
  const g = ctx.createGain();
  g.gain.value = gain;
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan));
  g.connect(p).connect(sfxBus);
  SOUNDS[name](g, t + 0.01);
}

/** Below this zoom the city is a map; agents are silent there. */
const HEARING_ZOOM = 0.45;

/**
 * A sound from something on screen: loudness from distance to the screen's
 * centre and from zoom, stereo position from its x.
 */
export function sfxAt(name, displayObject, zoom, loud = 1) {
  if (!state.sfx || !app || zoom < HEARING_ZOOM) return;
  const p = displayObject.getGlobalPosition();
  const w = app.screen.width, h = app.screen.height;
  if (p.x < -60 || p.y < -60 || p.x > w + 60 || p.y > h + 60) return;
  const dx = (p.x - w / 2) / (w / 2), dy = (p.y - h / 2) / (h / 2);
  const near = Math.max(0, 1 - Math.hypot(dx, dy) * 0.55);
  const zoomGain = Math.min(1, (zoom - HEARING_ZOOM) / 0.8 + 0.25);
  play(name, loud * near * zoomGain, dx * 0.8);
}

/** Interface sounds that aren't anywhere in particular: alerts. */
export function sfx(name) {
  if (state.sfx) play(name, 1, 0);
}

/* ── Music ──────────────────────────────────────────────────────────────── */

/**
 * A tiny generative chiptune. Each biome has a scale and a lead instrument;
 * night slows it down and softens it; the world map has its own wandering
 * theme. Phrases are seeded random walks over the scale, each played twice so
 * the ear hears a tune rather than noodling.
 */
const SCALES = {
  major: [0, 2, 4, 7, 9],              // major pentatonic
  minor: [0, 3, 5, 7, 10],             // minor pentatonic
  hijaz: [0, 1, 4, 5, 7, 8, 10],       // desert colour
  lydian: [0, 2, 4, 6, 7, 9, 11],
};
const BIOME_MUSIC = {
  plains: { scale: 'major', root: 60, lead: 'square', bpm: 104 },
  meadow: { scale: 'major', root: 65, lead: 'triangle', bpm: 96 },
  forest: { scale: 'minor', root: 57, lead: 'triangle', bpm: 88 },
  coast: { scale: 'lydian', root: 62, lead: 'triangle', bpm: 92 },
  desert: { scale: 'hijaz', root: 62, lead: 'square', bpm: 100 },
  canyon: { scale: 'hijaz', root: 57, lead: 'sawtooth', bpm: 90 },
  snow: { scale: 'minor', root: 64, lead: 'sine', bpm: 80, bells: true },
  world: { scale: 'major', root: 55, lead: 'triangle', bpm: 76 },
};

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

const music = {
  running: false,
  mood: { biome: 'world', night: false, storm: false },
  step: 0,
  next: 0,
  phrase: [],
  seed: 1,

  start() {
    if (this.running) return;
    this.running = true;
    this.next = ctx.currentTime + 0.1;
    // Lookahead scheduler: wake often, schedule a little ahead, never drift.
    setInterval(() => this.schedule(), 90);
  },

  setMood(mood) {
    const changed = mood.biome !== this.mood.biome || mood.night !== this.mood.night;
    this.mood = mood;
    if (changed) this.phrase = [];
  },

  rand() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  },

  /** 16 eighth notes; -1 is a rest. A random walk over the scale, landing home at the end. */
  newPhrase(len) {
    const notes = [];
    let i = Math.floor(this.rand() * 3);
    for (let s = 0; s < 16; s++) {
      if (this.rand() < 0.28 && s % 4 !== 0) { notes.push(-1); continue; }
      i = Math.max(0, Math.min(len + 2, i + Math.round((this.rand() - 0.5) * 3)));
      notes.push(s === 15 ? 0 : i);
    }
    return notes;
  },

  schedule() {
    if (!state.music || !ctx || ctx.state !== 'running') return;
    const m = BIOME_MUSIC[this.mood.biome] ?? BIOME_MUSIC.plains;
    const scale = SCALES[m.scale];
    const bpm = m.bpm * (this.mood.night ? 0.8 : 1);
    const eighth = 60 / bpm / 2;
    while (this.next < ctx.currentTime + 0.3) {
      const s = this.step % 32;
      // A phrase plays twice, then a new one.
      if (s === 0 && (this.step % 64 === 0 || !this.phrase.length)) this.phrase = this.newPhrase(scale.length);
      const degree = this.phrase[s % 16];
      const t = this.next;
      const soft = this.mood.night ? 0.6 : 1;

      if (degree >= 0) {
        const n = m.root + 12 * Math.floor(degree / scale.length) + scale[degree % scale.length];
        tone(musicBus, { type: m.lead, f: midi(n), t0: t, peak: 0.22 * soft, decay: eighth * 1.6, attack: 0.01 });
        if (m.bells) tone(musicBus, { f: midi(n + 12), t0: t, peak: 0.08 * soft, decay: eighth * 3 });
      }
      // Bass on beats: root and fifth.
      if (s % 4 === 0) {
        const bass = m.root - 24 + (Math.floor(s / 8) % 2 ? 7 : 0);
        tone(musicBus, { type: 'triangle', f: midi(bass), t0: t, peak: 0.3 * soft, decay: eighth * 3.2, attack: 0.02 });
      }
      // Soft hat on off-beats, quieter at night, gone in a storm (the rain is enough).
      if (s % 2 === 1 && !this.mood.storm) hiss(musicBus, { t0: t, peak: 0.05 * soft, decay: 0.04, type: 'highpass', f: 7000 });

      this.next += eighth;
      this.step++;
    }
  },
};

export function setMusicMood(mood) { music.setMood(mood); }
