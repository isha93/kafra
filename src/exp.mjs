/**
 * EXP and levels: one adventurer per class per town.
 *
 * "Lord Knight of Einbroch" is every Claude Opus session in that repo, so its
 * level keeps climbing across sessions and days. EXP is earned while Kafra is
 * watching: each scan, tools that finished since the last one are counted once,
 * from the recent tools every source already reports.
 *
 * Only numbers are saved, to ~/.config/kafra/exp.json (or KAFRA_EXP_FILE):
 * EXP per adventurer, and per session the ids of recent tools already counted.
 * No prompts, paths or code.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

/** EXP per finished tool, by what it did. */
export const EXP = { tool: 1, build: 3, trial: 5, slain: 15 };
export const MAX_LEVEL = 99;
/** Sessions not seen for this long are forgotten; their EXP stays with the adventurer. */
const FORGET_MS = 14 * 86_400_000;
const SAVE_EVERY_MS = 30_000;

/** Total EXP needed to reach `level`: 25 for Lv.2, ~840 for Lv.10, ~2800 for Lv.20. */
export const expFor = (level) => Math.round(25 * (level - 1) ** 1.6);

/** Level, and progress through it, for a total EXP. */
export function levelOf(exp) {
  let level = 1;
  while (level < MAX_LEVEL && exp >= expFor(level + 1)) level++;
  const base = expFor(level);
  const need = level < MAX_LEVEL ? expFor(level + 1) - base : 0;
  return { level, exp, into: exp - base, need };
}

/**
 * EXP for one finished tool. A passing test run after a failing one slays the
 * arena's bug (web/city/bugs.js) and earns the bonus too.
 */
export function expOf(tool, wasFailing) {
  if (tool.error) return 0;
  if (tool.kind === 'trial') return EXP.trial + (wasFailing ? EXP.slain : 0);
  if (tool.kind === 'build') return EXP.build;
  return EXP.tool;
}

export const defaultExpPath = () => process.env.KAFRA_EXP_FILE
  ?? join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'kafra', 'exp.json');

export class ExpBook {
  constructor(path = defaultExpPath()) {
    this.path = path;
    this.adventurers = {};  // "<town root>|<class>" → { exp, slain }
    this.sessions = {};     // session id → { ids: counted tool ids still in its recent window, seen }
    this.dirty = false;
    this.savedAt = 0;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      this.adventurers = raw.adventurers ?? {};
      this.sessions = raw.sessions ?? {};
    } catch { /* first run, or unreadable: start fresh */ }
  }

  /** Count newly finished tools and put each agent's level on it, in place. */
  observe(towns, now = Date.now()) {
    for (const town of towns) {
      for (const a of town.agents) {
        const key = `${town.root ?? town.id}|${a.sprite ?? a.job}`;
        const hero = (this.adventurers[key] ??= { exp: 0, slain: 0 });
        const session = (this.sessions[a.id] ??= { ids: [], seen: now });
        session.seen = now;
        const counted = new Set(session.ids);
        const window = new Set();
        let failing = false;
        // Oldest first, so a pass is judged against the run before it.
        for (const t of [...(a.tools ?? [])].reverse()) {
          window.add(t.id);
          if (!t.done) continue;
          if (!counted.has(t.id)) {
            const gain = expOf(t, failing);
            hero.exp += gain;
            if (t.kind === 'trial' && !t.error && failing) hero.slain++;
            counted.add(t.id);
            this.dirty = true;
          }
          if (t.kind === 'trial') failing = t.error;
        }
        // Ids that left the window can't come back; keep the file small.
        session.ids = [...counted].filter((id) => window.has(id));
        a.level = { ...levelOf(hero.exp), slain: hero.slain };
      }
    }
    for (const [id, s] of Object.entries(this.sessions)) if (now - s.seen > FORGET_MS) delete this.sessions[id];
    if (this.dirty && now - this.savedAt > SAVE_EVERY_MS) this.save(now);
  }

  /** Write atomically; a failed write is retried on a later scan. */
  save(now = Date.now()) {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, adventurers: this.adventurers, sessions: this.sessions }));
      renameSync(tmp, this.path);
      this.dirty = false;
      this.savedAt = now;
    } catch { /* read-only home, full disk: keep counting in memory */ }
  }
}
