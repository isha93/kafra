# Kafra City art

Everything here is **optional**. Any key missing from `manifest.json` falls
back to the shapes drawn in code, so art can be added one piece at a time.

**Hard rule:** no original Ragnarok Online sprites, tilesets or images. That
includes AI output prompted with the game's character or asset names. The
style may be similar (chibi, 2.5D, warm colours); the content must be
original.

## manifest.json

```json
{
  "characters": { "knight": { "sheet": "characters/knight.json", "scale": 1.25, "anchor": [0.508, 0.734] } },
  "buildings":  { "library": { "image": "buildings/library.png", "scale": 1.185, "anchor": [0.508, 0.832] } },
  "decor":      { "tree": { "image": "decor/tree.png", "scale": 0.649, "anchor": [0.508, 0.781] } },
  "tiles":      { "grass": { "image": "tiles/grass.png" } },
  "icons":      { "build": { "image": "icons/build.png" } }
}
```

- `anchor` is the point of the image that touches the ground: the centre of the
  footprint, as fractions (0–1) of the image's width and height.
- `scale` shrinks or grows the image to its on-screen size.
- `scripts/gen-assets.mjs --pick` computes both from the image itself.

## Characters

Keys: `knight`, `assassin`, `hunter`, `bard`, `novice`, `kafra`, `villager1`,
`villager2`, `villager3`.

- **Format:** a PNG sprite sheet plus JSON. Either export from Aseprite
  (*File → Export Sprite Sheet → JSON Hash*, with **Tags** on) or use the
  TexturePacker format with an `animations` field.
- **Directions:** `s` faces the camera, `n` faces away, `e` and `w` are side
  views. A sheet without side views is mirrored automatically.
- **Animation names:** `<animation>_<direction>`. If a directional animation
  is missing, Kafra falls back to `<animation>_s`, then `<animation>`, then
  `idle`.

| Animation | Used for |
|---|---|
| `idle_*` | standing, waiting |
| `walk_*` | walking |
| `sit` | idle, resting |
| `build_*` | Edit / Write: swinging a hammer at a building |
| `trial_*` | running tests: striking at the arena |
| `research`, `craft`, … | Read / Bash and the rest: when absent, `idle` plus a code-drawn prop (book, flask, …) |

When a sheet animates an activity itself, the code-drawn prop for that activity
is hidden.

## Buildings, decor, tiles, icons

Isometric 2:1, with one tile = 32×16 px on screen.

| Key | Footprint | Notes |
|---|---|---|
| `district-1` … `district-5` | 2×2 | taller with each level; a town's tier caps the level |
| `library`, `workshop`, `inn` | 2×2 | civic buildings |
| `arena` | 2.6×2.6 | training yard |
| `kafra` | 1×1 | the plaza kiosk |
| `tent` | 2×2 | every building in a Camp, and the arena in a Village |
| `castle` | large | behind the walls of a Capital |
| decor: `tree`, `palm`, `pine`, `lamp`, `flowers`, `bench`, `campfire` | 1×1 | trees are chosen by biome |
| tiles: `grass`, `road`, `plaza`, `sand`, `snow` | — | square 32 px textures, projected onto the isometric grid |
| icons: `build`, `research`, `craft`, `trial`, `deliver`, `teleport`, `summon`, `cast`, `waiting`, `resting` | — | used in bubbles, panels and the chat log |

Scaffolding, signboards, smoke, walls and lamp glow are still drawn in code on
top of the art.

## Generating art (Retro Diffusion)

Everything in this folder was made with `scripts/gen-assets.mjs`, which also
holds the prompts. The `wizard` sheet (Codex) was made the same way; Gemini's
`sage` reuses the bard's sheet tinted blue (see `ALIAS` in `web/city/skin.js`). It needs `RETRO_DIFFUSION_API_KEY` in `.env`, which is
gitignored.

```bash
node scripts/gen-assets.mjs                        # price everything not generated yet (free dry run)
node scripts/gen-assets.mjs --run inn tree         # generate candidates into assets-src/candidates/
node scripts/gen-assets.mjs --pick inn=3 tree=1    # install chosen candidates and update the manifest
```

- **Characters** use `rd_animation__battle_sprites`, which returns a 14×4 sheet
  of 64 px frames. Rows are front, right, back and left. Columns are idle ×3,
  walk ×6, jump ×2 and attack ×3. The source sheets are kept in
  `assets-src/sheets/`.
- **Custom actions** (`knight.build` and similar) use
  `rd_advanced_animation__custom_action`. It produces 8 frames animated from
  the character's idle frame, which are appended to that character's sheet as
  an extra row (sources in `assets-src/actions/`).
  - The hammer action works well for knight, assassin, hunter and novice.
  - The reading and crafting actions never showed a book or flask, so they are
    not installed.
  - Bard's hammer flash covered the body, so bard uses its attack animation.
- **Buildings and decor** use `rd_plus__isometric_asset` with a transparent
  background.
- **Tiles** use `rd_tile__single_tile`, seamless at 32 px.
- **Icons** use `rd_plus__skill_icon`.

Prompts never mention Ragnarok: the Kafra booth is a "market kiosk" and the
attendant a "shop attendant".

## Starting prompts for other tools

Use a dedicated pixel-art generator rather than a general image model, because
general models don't produce a clean pixel grid. Clean up the result in
Aseprite (outline, palette, frame-to-frame jitter) before exporting.

> chibi fantasy RPG knight, 2.5D pixel art, 3/4 view facing down-left, big
> head small body, red tabard over steel armor, short cape, warm saturated
> palette, 1px dark outline, transparent background

> isometric pixel art medieval fantasy townhouse, 2:1 isometric, cream plaster
> walls, timber frame, red tile hip roof, small windows, warm sunny palette,
> 1px outline, transparent background
