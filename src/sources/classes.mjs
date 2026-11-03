/**
 * Job class per agent. The tool decides the family, the model the rank, so a
 * glance tells Claude from Codex from Gemini, and Opus from Haiku.
 * Cosmetic, but it makes a list of UUIDs readable.
 */

export const SOURCE_NAME = { 'claude-code': 'Claude Code', codex: 'Codex', gemini: 'Gemini CLI' };

export function jobFor(source, model = '') {
  const m = model.toLowerCase();
  if (source === 'codex') return { job: 'Wizard', sprite: 'wizard' };
  if (source === 'gemini') return { job: 'Sage', sprite: 'sage' };
  if (m.includes('opus')) return { job: 'Lord Knight', sprite: 'knight' };
  if (m.includes('sonnet')) return { job: 'Assassin Cross', sprite: 'assassin' };
  if (m.includes('haiku')) return { job: 'Hunter', sprite: 'hunter' };
  if (m.includes('fable')) return { job: 'Bard', sprite: 'bard' };
  return { job: 'Novice', sprite: 'novice' };
}
