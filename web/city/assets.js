/**
 * Optional art. Anything listed in web/assets/manifest.json replaces the drawn
 * placeholder for that key; anything missing keeps the placeholder.
 *
 * That lets AI-generated or commissioned art land one file at a time: drop in a
 * knight sheet and only knights change. The format is in web/assets/README.md.
 */
import { Assets, Spritesheet, Texture } from '/vendor/pixi.mjs';

const BASE = '/assets/';

/** class → { sheet, scale, anchor } */
export const characterSheets = new Map();
/** building key → { texture, scale, anchor } */
export const buildingArt = new Map();
/** decor key (tree, lamp, flowers, bench) → { texture, scale, anchor } */
export const decorArt = new Map();
/** ground material (grass, road, plaza) → texture, tiled across the town */
export const tileArt = new Map();
/** activity kind → { texture, url } for bubbles (canvas) and panels (HTML) */
export const iconArt = new Map();

/**
 * Aseprite's JSON export keeps animations as `meta.frameTags`; Pixi wants an
 * `animations` map of frame names. Convert so artists can export straight from
 * Aseprite (File → Export Sprite Sheet, JSON Hash, tags on).
 */
function withAnimations(data) {
  if (data.animations || !data.meta?.frameTags) return data;
  const names = Object.keys(data.frames);
  const animations = {};
  for (const tag of data.meta.frameTags) animations[tag.name] = names.slice(tag.from, tag.to + 1);
  return { ...data, animations };
}

async function loadSheet(path) {
  const data = withAnimations(await (await fetch(BASE + path)).json());
  const image = new URL(data.meta.image, new URL(BASE + path, location.href)).pathname;
  const texture = await Assets.load(image);
  texture.source.scaleMode = 'nearest';
  const sheet = new Spritesheet(texture, data);
  await sheet.parse();
  return sheet;
}

/** Load whatever the manifest lists. Never throws: missing art is the normal case. */
export async function loadArt() {
  let manifest;
  try {
    const res = await fetch(BASE + 'manifest.json');
    if (!res.ok) return;
    manifest = await res.json();
  } catch { return; }

  const jobs = [];
  for (const [cls, entry] of Object.entries(manifest.characters ?? {})) {
    jobs.push(loadSheet(entry.sheet).then(
      (sheet) => characterSheets.set(cls, { sheet, scale: entry.scale ?? 1, anchor: entry.anchor ?? [0.5, 1] }),
      (err) => console.warn(`kafra: sheet ${cls} gagal dimuat`, err),
    ));
  }
  for (const [section, target] of [['tiles', tileArt], ['icons', iconArt]]) {
    for (const [key, entry] of Object.entries(manifest[section] ?? {})) {
      jobs.push(Assets.load(BASE + entry.image).then(
        (texture) => {
          texture.source.scaleMode = 'nearest';
          target.set(key, { texture, url: BASE + entry.image });
        },
        (err) => console.warn(`kafra: gambar ${key} gagal dimuat`, err),
      ));
    }
  }
  for (const [section, target] of [['buildings', buildingArt], ['decor', decorArt]]) {
    for (const [key, entry] of Object.entries(manifest[section] ?? {})) {
      jobs.push(Assets.load(BASE + entry.image).then(
        (texture) => {
          texture.source.scaleMode = 'nearest';
          target.set(key, { texture, scale: entry.scale ?? 1, anchor: entry.anchor ?? [0.5, 1] });
        },
        (err) => console.warn(`kafra: gambar ${key} gagal dimuat`, err),
      ));
    }
  }
  await Promise.all(jobs);
}

/** Frames per second by animation; idling at walking speed looks like shivering. */
const FPS = { idle: 4, sit: 1, walk: 10, build: 8, trial: 6, attack: 6, research: 5, craft: 7 };

/** Icon for an activity kind; asking shares the waiting icon. */
export function iconFor(kind) {
  return iconArt.get(kind === 'ask' ? 'waiting' : kind) ?? null;
}

/** Whether a sheet animates this activity itself, rather than idling with a drawn prop. */
export function sheetHas(entry, anim) {
  const a = entry.sheet.animations;
  return Boolean(a[`${anim}_s`] ?? a[anim]);
}

/**
 * Pick a frame from a sheet: `<anim>_<dir>` first, then `<anim>`, then idle.
 * Directions: `s` facing the camera, `n` away, `e`/`w` side views. A sheet
 * without side views falls back to `s`.
 */
export function sheetFrame(entry, anim, dir, t) {
  const a = entry.sheet.animations;
  const frames = a[`${anim}_${dir}`] ?? a[`${anim}_s`] ?? a[anim] ?? a[`idle_${dir}`] ?? a.idle_s ?? a.idle ?? Object.values(a)[0];
  if (!frames?.length) return Texture.EMPTY;
  return frames[Math.floor(t * (FPS[anim] ?? 8)) % frames.length];
}
