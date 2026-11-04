/**
 * One question for every character on screen: which texture right now?
 *
 * A loaded sprite sheet answers if there is one for the class; otherwise the
 * drawn placeholder does. Callers never know which they got.
 */
import { charTexture } from './art.js';
import { characterSheets, sheetFrame, sheetHas } from './assets.js';

const PLACEHOLDER_SCALE = 2;

/**
 * Classes that borrow another class's sheet, recoloured, until they have art
 * of their own: Gemini's Sage wears the bard's in pale blue, Cursor's
 * Whitesmith the knight's in gold, OpenCode's Champion the rogue's in red,
 * Aider's Gunslinger the archer's in tan.
 */
const ALIAS = {
  sage: { sheet: 'bard', tint: 0xb8d4ff },
  whitesmith: { sheet: 'knight', tint: 0xffd27a },
  champion: { sheet: 'assassin', tint: 0xff9c8a },
  gunslinger: { sheet: 'hunter', tint: 0xe0cc9e },
};

/** The sheet a class is drawn with, and its tint: its own, or the one it borrows. */
export function sheetFor(cls) {
  if (characterSheets.has(cls)) return { sheet: cls, tint: null };
  const alias = ALIAS[cls];
  return alias && characterSheets.has(alias.sheet) ? alias : null;
}

/**
 * @param cls      job class or villager key
 * @param anim     idle | walk | sit | build | research | craft | trial | deliver | cast | summon | teleport
 * @param heading  's' toward the camera, 'n' away, 'e'/'w' sideways
 * @param t        seconds, drives frame selection
 * @returns texture, scale, anchor, and `flip` (mirror horizontally)
 */
export function bodyFrame(cls, anim, heading, t) {
  const alias = ALIAS[cls];
  const sheet = characterSheets.get(cls) ?? (alias && characterSheets.get(alias.sheet));
  const tint = !characterSheets.has(cls) && alias ? alias.tint : 0xffffff;
  if (sheet) {
    // Sheets with side views draw east and west themselves; never mirror them.
    const hasSide = Boolean(sheet.sheet.animations.idle_e);
    const dir = hasSide ? heading : heading === 'n' ? 'n' : 's';
    return { texture: sheetFrame(sheet, anim, dir, t), scale: sheet.scale, anchor: sheet.anchor, flip: !hasSide && heading === 'w', tint };
  }

  // The placeholder only has front and back; sideways is the front, mirrored for west.
  let frame = anim === 'sit' ? 'sit' : anim === 'walk' && t % 0.3 < 0.15 ? 'walk' : 'stand';
  if (heading === 'n' && frame !== 'sit') frame += '_n';
  return { texture: charTexture(cls, frame), scale: PLACEHOLDER_SCALE, anchor: [0.5, 1], flip: heading === 'w', tint: 0xffffff };
}

/** Whether a real sheet animates this activity, so the drawn prop should step aside. */
export function animates(cls, anim) {
  const sheet = characterSheets.get(cls) ?? characterSheets.get(ALIAS[cls]?.sheet);
  return Boolean(sheet && sheetHas(sheet, anim));
}
