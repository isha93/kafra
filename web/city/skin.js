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
 * @param cls      job class or villager key
 * @param anim     idle | walk | sit | build | research | craft | trial | deliver | cast | summon | teleport
 * @param heading  's' toward the camera, 'n' away, 'e'/'w' sideways
 * @param t        seconds, drives frame selection
 * @returns texture, scale, anchor, and `flip` (mirror horizontally)
 */
export function bodyFrame(cls, anim, heading, t) {
  const sheet = characterSheets.get(cls);
  if (sheet) {
    // Sheets with side views draw east and west themselves; never mirror them.
    const hasSide = Boolean(sheet.sheet.animations.idle_e);
    const dir = hasSide ? heading : heading === 'n' ? 'n' : 's';
    return { texture: sheetFrame(sheet, anim, dir, t), scale: sheet.scale, anchor: sheet.anchor, flip: !hasSide && heading === 'w' };
  }

  // The placeholder only has front and back; sideways is the front, mirrored for west.
  let frame = anim === 'sit' ? 'sit' : anim === 'walk' && t % 0.3 < 0.15 ? 'walk' : 'stand';
  if (heading === 'n' && frame !== 'sit') frame += '_n';
  return { texture: charTexture(cls, frame), scale: PLACEHOLDER_SCALE, anchor: [0.5, 1], flip: heading === 'w' };
}

/** Whether a real sheet animates this activity, so the drawn prop should step aside. */
export function animates(cls, anim) {
  const sheet = characterSheets.get(cls);
  return Boolean(sheet && sheetHas(sheet, anim));
}
