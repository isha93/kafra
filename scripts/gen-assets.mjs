/**
 * Generate Kafra City art with Retro Diffusion, then install the picks.
 *
 *   node scripts/gen-assets.mjs                     price everything not generated yet (free)
 *   node scripts/gen-assets.mjs --run [names]       generate candidates into assets-src/candidates/
 *   node scripts/gen-assets.mjs --pick inn=2 knight=1 knight.build=1 …   install chosen candidates
 *
 * Names: buildings, decor and characters by key (`inn`, `tree`, `knight`),
 * tiles as `tile.grass`, icons as `icon.build`, character actions as
 * `<class>.<kind>` (`knight.build`). Actions animate from the class's installed
 * sheet, so pick the character first.
 *
 * Prompts live here so the look is reproducible. No words from Ragnarok itself
 * go into prompts: the Kafra booth is a "market kiosk", the attendant a "shop
 * attendant".
 */
import { readFile, writeFile, mkdir, copyFile, readdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { apiKey, infer, generate } from './rd.mjs';
import { decode, encode, crop, opaqueBox } from './png.mjs';

const ROOT = new URL('..', import.meta.url);
const path = (rel) => fileURLToPath(new URL(rel, ROOT));
const CANDIDATES = 'assets-src/candidates/';
const MANIFEST = path('web/assets/manifest.json');

const BUILDING_LOOK = 'isometric pixel art, 2:1 isometric, cozy medieval fantasy town, warm saturated palette, clean 1px dark outline, single building centered, transparent background';
const DECOR_LOOK = 'isometric pixel art, 2:1 isometric, cozy medieval fantasy town, warm saturated palette, clean 1px dark outline, single object centered, transparent background';
const CHAR_LOOK = 'chibi proportions, big head, top-down rpg character, warm colors, clean dark outline';
const TILE_LOOK = 'seamless pixel art ground texture, top-down, warm cozy fantasy palette, subtle detail, no objects';
const ICON_LOOK = 'fantasy rpg skill icon, warm palette, bold readable silhouette, dark outline';

const CLASSES = ['knight', 'assassin', 'hunter', 'bard', 'novice'];

/** Character actions, animated from the class's camera-facing idle frame. */
const ACTIONS = {
  build: 'the character raises a blacksmith hammer and strikes down hard in front of them, building something, sparks fly',
  research: 'the character holds an open book in both hands and reads it, turning a page, nodding slightly',
  craft: 'the character holds a glass potion flask and shakes it, green bubbles and sparkles rise from it',
};

const ICONS = {
  build: 'blacksmith hammer striking an anvil with sparks',
  research: 'open magic book with glowing pages',
  craft: 'bubbling green potion flask',
  trial: 'crossed swords',
  deliver: 'wooden treasure chest with gold coins',
  teleport: 'blue swirling warp portal',
  summon: 'purple magic summoning circle',
  cast: 'glowing cyan magic orb',
  waiting: 'golden exclamation mark speech bubble',
  resting: 'crescent moon with z letters',
};

/** kind: building | decor | character | action | tile | icon. `n` candidates per generation. */
const ASSETS = {
  'district-1': { kind: 'building', n: 4, prompt: 'small cottage, cream plaster walls, timber frame, red tile roof, one door, two small windows' },
  'district-2': { kind: 'building', n: 4, prompt: 'two-storey townhouse, cream plaster walls, timber frame, red tile roof, chimney' },
  'district-3': { kind: 'building', n: 4, prompt: 'three-storey town house, cream plaster walls, timber frame, red tile roof, balcony with flower boxes' },
  'district-4': { kind: 'building', n: 4, prompt: 'tall guild hall, stone ground floor, cream plaster upper floors, red tile roof, banner over the door' },
  'district-5': { kind: 'building', n: 4, prompt: 'grand five-storey tower house, stone and plaster, red tile spire roof, gold weathervane' },
  library: { kind: 'building', n: 4, prompt: 'tall round stone library tower, blue conical roof, gold finial, arched windows, wooden door' },
  workshop: { kind: 'building', n: 4, prompt: 'blacksmith workshop, brick walls, dark wooden roof, tall brick chimney, anvil and barrel outside' },
  inn: { kind: 'building', n: 4, prompt: 'cozy two-storey inn, green tile roof, hanging wooden sign, warm lit windows, bench by the door' },
  arena: { kind: 'building', n: 4, prompt: 'small square training yard, packed dirt ground, low wooden fence, two straw training dummies on posts' },
  booth: { kind: 'building', as: 'kafra', n: 4, size: 96, prompt: 'small market kiosk, pink and white striped awning, wooden counter, flower pots' },

  tent: { kind: 'building', n: 2, size: 64, prompt: 'small canvas camping tent with wooden poles, adventurer camp' },
  castle: { kind: 'building', n: 2, prompt: 'grand stone castle keep with four towers, blue roofs, flags, fortress' },

  tree: { kind: 'decor', n: 4, size: 64, prompt: 'round leafy green oak tree' },
  palm: { kind: 'decor', n: 2, size: 64, prompt: 'desert palm tree with a sandy base' },
  pine: { kind: 'decor', n: 2, size: 64, prompt: 'snowy pine tree, white snow on branches' },
  campfire: { kind: 'decor', n: 2, size: 64, prompt: 'small campfire with logs and stones, flames' },
  lamp: { kind: 'decor', n: 4, size: 64, prompt: 'iron street lamp post with a warm glowing lantern' },
  flowers: { kind: 'decor', n: 4, size: 64, prompt: 'small flower bed with red and yellow flowers' },
  bench: { kind: 'decor', n: 4, size: 64, prompt: 'small wooden park bench' },

  knight: { kind: 'character', n: 2, prompt: 'fantasy knight, red tabard over silver armor, short red cape, steel helmet, holding a sword' },
  assassin: { kind: 'character', n: 2, prompt: 'fantasy rogue, purple hooded cloak, dark cloth mask over the mouth, twin daggers' },
  hunter: { kind: 'character', n: 2, prompt: 'fantasy archer ranger, green feathered cap, green tunic, bow in hand, quiver on back' },
  bard: { kind: 'character', n: 2, prompt: 'fantasy bard, blue coat with gold trim, feathered hat, holding a lute' },
  novice: { kind: 'character', n: 2, prompt: 'young apprentice adventurer, plain brown tunic, brown hair, short wooden sword' },
  kafra: { kind: 'character', n: 2, prompt: 'friendly shop attendant girl, teal long dress, white apron, pink ribbon in brown hair' },
  villager1: { kind: 'character', n: 2, prompt: 'medieval villager woman, green dress, orange hair, carrying a basket' },
  villager2: { kind: 'character', n: 2, prompt: 'medieval farmer man, straw hat, yellow shirt, brown trousers' },
  villager3: { kind: 'character', n: 2, prompt: 'medieval merchant, red vest, blonde hair, leather satchel' },

  'tile.grass': { kind: 'tile', as: 'grass', n: 2, prompt: 'short green meadow grass with a few tiny flowers' },
  'tile.road': { kind: 'tile', as: 'road', n: 2, prompt: 'warm beige cobblestone street' },
  'tile.plaza': { kind: 'tile', as: 'plaza', n: 2, prompt: 'light sandstone plaza paving slabs' },
  'tile.sand': { kind: 'tile', as: 'sand', n: 1, prompt: 'warm golden desert sand with small ripples' },
  'tile.snow': { kind: 'tile', as: 'snow', n: 1, prompt: 'soft white snow ground with light blue shadows' },

  ...Object.fromEntries(Object.entries(ICONS).map(([k, p]) => [`icon.${k}`, { kind: 'icon', as: k, n: 2, prompt: p }])),
  ...Object.fromEntries(CLASSES.flatMap((cls) => Object.entries(ACTIONS).map(([k, p]) => [`${cls}.${k}`, { kind: 'action', cls, action: k, n: 1, prompt: p }]))),
};

const fileKey = (name) => `${ASSETS[name].kind}-${name.replace(/\./g, '-')}`;

function resolve(arg) {
  const a = ASSETS[arg];
  if (!a) throw new Error(`aset tidak dikenal: ${arg}`);
  return { ...a, name: arg, as: a.as ?? arg };
}

/** Camera-facing idle frame of an installed character, as the starting frame for an action. */
async function startFrame(cls) {
  const buf = await readFile(path(`assets-src/sheets/${cls}.png`)).catch(() => {
    throw new Error(`pasang karakter ${cls} dulu (--pick ${cls}=N) sebelum membuat aksinya`);
  });
  return encode(crop(decode(buf), 0, 0, 64, 64)).toString('base64');
}

async function requests(name) {
  const a = ASSETS[name];
  switch (a.kind) {
    case 'character':
      // One sheet per request for this style; candidates are separate requests.
      return Array.from({ length: a.n }, () => ({
        prompt: `${a.prompt}, ${CHAR_LOOK}`, prompt_style: 'rd_animation__battle_sprites',
        width: 64, height: 64, num_images: 1, return_spritesheet: true,
      }));
    case 'action':
      return [{
        prompt: a.prompt, prompt_style: 'rd_advanced_animation__custom_action',
        width: 64, height: 64, num_images: 1, frames_duration: 8, return_spritesheet: true,
        input_image: await startFrame(a.cls),
      }];
    case 'tile':
      return [{ prompt: `${a.prompt}, ${TILE_LOOK}`, prompt_style: 'rd_tile__single_tile', width: 32, height: 32, num_images: a.n, tile_x: true, tile_y: true }];
    case 'icon':
      return [{ prompt: `${a.prompt}, ${ICON_LOOK}`, prompt_style: 'rd_plus__skill_icon', width: 48, height: 48, num_images: a.n }];
    default: {
      const size = a.size ?? 128;
      return [{
        prompt: `${a.prompt}, ${a.kind === 'decor' ? DECOR_LOOK : BUILDING_LOOK}`,
        prompt_style: 'rd_plus__isometric_asset', width: size, height: size, num_images: a.n, remove_bg: true,
      }];
    }
  }
}

async function existing() {
  const files = await readdir(path(CANDIDATES)).catch(() => []);
  return new Set(files.map((f) => f.replace(/-\d+\.png$/, '')));
}

async function price(key, names) {
  let total = 0;
  for (const name of names) {
    let cost = 0;
    for (const body of await requests(name)) cost += (await infer(key, { ...body, check_cost: true })).balance_cost ?? 0;
    total += cost;
    console.log(`${ASSETS[name].kind.padEnd(10)}${name.padEnd(18)} $${cost.toFixed(2)}`);
  }
  console.log(`\ntotal $${total.toFixed(2)} untuk ${names.length} aset. Belum ada yang di-generate.`);
}

async function run(key, names) {
  let spent = 0;
  await mkdir(path(CANDIDATES), { recursive: true });
  const queue = [];
  for (const name of names) (await requests(name)).forEach((body, i) => queue.push({ name, body, i }));
  // The API allows two concurrent jobs per key.
  const worker = async () => {
    for (let job; (job = queue.shift());) {
      const { name, body, i } = job;
      const prefix = path(CANDIDATES + fileKey(name));
      // Styles that return one image per request get one request per candidate.
      const perRequest = ASSETS[name].kind === 'character';
      try {
        const r = await generate(key, body, perRequest ? `${prefix}-x${i + 1}` : prefix);
        spent += r.cost;
        console.log(`${name}: ${r.paths.length} gambar · $${r.cost} · sisa $${r.remaining}`);
      } catch (err) {
        console.log(`${name}: gagal — ${err.message}`);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  // Per-request candidates come back as <prefix>-x<i>-1.png; flatten to <prefix>-<i>.png.
  for (const f of await readdir(path(CANDIDATES))) {
    const m = f.match(/^(.*)-x(\d+)-1\.png$/);
    if (m) await rename(path(CANDIDATES + f), path(`${CANDIDATES}${m[1]}-${m[2]}.png`));
  }
  console.log(`\nterpakai $${spent.toFixed(2)}`);
}

/* ── Installing picks ───────────────────────────────────────────────────── */

/**
 * battle_sprites sheets are 14 columns × 4 rows of 64px frames.
 * Rows: facing camera, right, away, left. Columns: idle ×3, walk ×6, jump ×2, attack ×3.
 * Action sheets (custom_action, 8 frames wrapped 4×2) are unwrapped into one row each below.
 */
const F = 64;
const SHEET = { rows: { s: 0, e: 1, n: 2, w: 3 }, cols: { idle: [0, 3], walk: [3, 9], jump: [9, 11], attack: [11, 14] } };
/** Activities the base sheet can play when there is no custom action for them. */
const FALLBACK_STRIP = { build: 'attack', trial: 'attack' };

/** Compose base sheet + action rows into web/assets/characters/<cls>.{png,json}. */
async function buildCharacter(cls) {
  const base = decode(await readFile(path(`assets-src/sheets/${cls}.png`)));
  const actions = [];
  for (const kind of Object.keys(ACTIONS)) {
    const img = await readFile(path(`assets-src/actions/${cls}-${kind}.png`)).then(decode, () => null);
    if (img) actions.push({ kind, img });
  }

  const w = base.w;
  const h = base.h + actions.length * F;
  const data = Buffer.alloc(w * h * 4);
  base.data.copy(data, 0);
  const frames = {};
  const animations = {};
  const add = (id, x, y) => {
    frames[id] = { frame: { x, y, w: F, h: F }, sourceSize: { w: F, h: F }, spriteSourceSize: { x: 0, y: 0, w: F, h: F } };
    return id;
  };

  for (const [dir, row] of Object.entries(SHEET.rows)) {
    for (const [strip, [from, to]] of Object.entries(SHEET.cols)) {
      animations[`${strip}_${dir}`] = [];
      for (let c = from; c < to; c++) animations[`${strip}_${dir}`].push(add(`${strip}_${dir}_${c - from}`, c * F, row * F));
    }
  }
  actions.forEach(({ kind, img }, r) => {
    const y0 = base.h + r * F;
    const perRow = img.w / F;
    const count = Math.min(perRow * (img.h / F), w / F);
    animations[`${kind}_s`] = [];
    for (let k = 0; k < count; k++) {
      const frame = crop(img, (k % perRow) * F, Math.floor(k / perRow) * F, F, F);
      for (let y = 0; y < F; y++) frame.data.copy(data, ((y0 + y) * w + k * F) * 4, y * F * 4, (y + 1) * F * 4);
      animations[`${kind}_s`].push(add(`${kind}_s_${k}`, k * F, y0));
    }
  });
  for (const [kind, strip] of Object.entries(FALLBACK_STRIP)) {
    if (animations[`${kind}_s`]) continue;
    for (const dir of Object.keys(SHEET.rows)) animations[`${kind}_${dir}`] = animations[`${strip}_${dir}`];
  }
  animations.sit = animations.idle_s.slice(0, 1);

  await mkdir(path('web/assets/characters'), { recursive: true });
  await writeFile(path(`web/assets/characters/${cls}.png`), encode({ w, h, data }));
  await writeFile(path(`web/assets/characters/${cls}.json`), JSON.stringify({ frames, animations, meta: { image: `${cls}.png`, size: { w, h }, scale: '1' } }));

  // Feet line and height from the camera-facing idle frame; about 40px tall on screen.
  const b = opaqueBox(base, 0, 0, F, F);
  return {
    sheet: `characters/${cls}.json`,
    scale: +(40 / (b.maxY - b.minY + 1)).toFixed(3),
    anchor: [+((b.minX + b.maxX + 1) / 2 / F).toFixed(3), +((b.maxY + 1) / F).toFixed(3)],
  };
}

/** Screen width, in px, each building's footprint should fill. One tile is 32px wide. */
const FOOTPRINT_PX = { arena: 2.6 * 32, kafra: 32 * 1.4, tent: 44, castle: 150 };
const DECOR_PX = { tree: 24, lamp: 8, flowers: 16, bench: 16, palm: 24, pine: 22, campfire: 16 };
const FOLDER = { decor: 'decor', tile: 'tiles', icon: 'icons', building: 'buildings' };
const SECTION = { decor: 'decor', tile: 'tiles', icon: 'icons', building: 'buildings' };

async function installImage(as, kind, src) {
  const folder = FOLDER[kind];
  const dest = path(`web/assets/${folder}/${as}.png`);
  await mkdir(path(`web/assets/${folder}`), { recursive: true });
  await copyFile(src, dest);
  if (kind === 'tile' || kind === 'icon') return { image: `${folder}/${as}.png` };

  const img = decode(await readFile(dest));
  const b = opaqueBox(img);
  const width = b.maxX - b.minX + 1;
  const target = kind === 'decor' ? DECOR_PX[as] ?? 24 : FOOTPRINT_PX[as] ?? 64;
  return {
    image: `${folder}/${as}.png`,
    scale: +(target / width).toFixed(3),
    // Horizontal centre of the art; feet a little above the lowest opaque row,
    // because isometric art's front corner dips below the footprint's centre line.
    anchor: [+((b.minX + b.maxX + 1) / 2 / img.w).toFixed(3), +((b.maxY + 1 - (kind === 'decor' ? 2 : width * 0.25)) / img.h).toFixed(3)],
  };
}

async function pick(choices) {
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8').catch(() => '{}'));
  for (const section of ['characters', ...Object.values(SECTION)]) manifest[section] ??= {};
  const rebuild = new Set();
  for (const choice of choices) {
    const [ref, n] = choice.split('=');
    const a = resolve(ref);
    const src = path(`${CANDIDATES}${fileKey(ref)}-${n}.png`);
    if (a.kind === 'character') {
      await mkdir(path('assets-src/sheets'), { recursive: true });
      await copyFile(src, path(`assets-src/sheets/${a.as}.png`));
      rebuild.add(a.as);
    } else if (a.kind === 'action') {
      await mkdir(path('assets-src/actions'), { recursive: true });
      await copyFile(src, path(`assets-src/actions/${a.cls}-${a.action}.png`));
      rebuild.add(a.cls);
    } else {
      manifest[SECTION[a.kind]][a.as] = await installImage(a.as, a.kind, src);
    }
    console.log(`${a.kind} ${ref} ← kandidat ${n}`);
  }
  for (const cls of rebuild) manifest.characters[cls] = await buildCharacter(cls);
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--pick') return pick(args.slice(1));

  const key = await apiKey();
  const have = await existing();
  const listed = args.filter((a) => !a.startsWith('--'));
  const names = listed.length ? listed.map((a) => resolve(a).name) : Object.keys(ASSETS).filter((n) => !have.has(fileKey(n)));
  if (args.includes('--run')) return run(key, names);
  return price(key, names);
}

main().catch((err) => { console.error(String(err.message ?? err)); process.exit(1); });
