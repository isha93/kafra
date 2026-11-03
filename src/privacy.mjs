/**
 * What may leave the server.
 *
 * Two layers, both applied before anything is sent to the browser:
 *
 * 1. kafra.config.json: hide repos, show only some, add redaction words.
 * 2. Public mode: keep the game, drop every piece of text. Towns, tiers,
 *    activity kinds and statuses stay; prompts, titles, paths, repo and
 *    branch names, commit subjects and hashes go. Identifiers that embed
 *    paths are replaced by hashes.
 *
 * Filtering happens here, on the server, so hidden data never reaches the page
 * at all — not even in the network tab.
 */
import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { setExtraRedactions } from './activity.mjs';

export const CONFIG_PATH = process.env.KAFRA_CONFIG ?? fileURLToPath(new URL('../kafra.config.json', import.meta.url));

const EMPTY = { hide: [], only: [], redact: [], public: false };
let cached = { mtime: -1, config: EMPTY, error: null };

/** The config, re-read whenever the file changes. A broken file is reported, never fatal. */
export function loadConfig() {
  let mtime = 0;
  try { mtime = statSync(CONFIG_PATH).mtimeMs; } catch { mtime = 0; }
  if (mtime !== cached.mtime) {
    let config = EMPTY, error = null;
    if (mtime) {
      try {
        const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
        config = {
          hide: strings(raw.hide), only: strings(raw.only), redact: strings(raw.redact), public: raw.public === true,
        };
      } catch (err) {
        error = `kafra.config.json tidak bisa dibaca: ${err.message}`;
      }
    }
    setExtraRedactions(config.redact);
    cached = { mtime, config, error };
  }
  const envPublic = process.env.KAFRA_PUBLIC === '1' || process.env.KAFRA_PUBLIC === 'true';
  return { ...cached.config, public: cached.config.public || envPublic, error: cached.error };
}

function strings(v) {
  return Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim()) : [];
}

/**
 * Glob for paths: `*` matches within one folder, `**` across folders, a
 * leading `~` is the home folder. A pattern matches a path or anything inside it.
 */
export function pathMatcher(pattern) {
  const expanded = pattern.startsWith('~') ? homedir() + pattern.slice(1) : pattern;
  const re = expanded
    .replace(/\/+$/, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*');
  // Patterns without a slash name a folder anywhere, like .gitignore does.
  const anchored = expanded.includes('/') ? `^${re}` : `(^|/)${re}`;
  return new RegExp(`${anchored}(/.*)?$`);
}

/** Whether a repo root (or a working directory outside git) may be shown. */
export function visible(path, { hide = [], only = [] }) {
  if (!path) return only.length === 0;
  if (hide.some((p) => pathMatcher(p).test(path))) return false;
  if (only.length && !only.some((p) => pathMatcher(p).test(path))) return false;
  return true;
}

/** Short stable stand-in for an identifier that contains a path. */
const opaque = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 12);

function publicTool(t) {
  return t && { id: t.id, kind: t.kind, name: t.name, at: t.at, done: t.done, error: t.error };
}

function publicAgent(a, districtName) {
  return {
    id: opaque(a.id),
    leader: a.leader ? opaque(a.leader) : null,
    source: a.source, model: a.model, job: a.job, sprite: a.sprite,
    hp: a.hp, tokens: a.tokens, contextWindow: a.contextWindow,
    kind: a.kind, status: a.status,
    tool: publicTool(a.tool), tools: (a.tools ?? []).map(publicTool),
    title: '', quest: '', preview: '',
    lastSeen: a.lastSeen, ageMs: a.ageMs,
    isParty: a.isParty, agentType: a.isParty ? 'party' : undefined,
    building: a.building ? districtName(a.building) : null,
    file: null,
    touched: (a.touched ?? []).map(districtName),
  };
}

/** The world with every piece of text removed; only the game is left. */
export function publicWorld(world) {
  const kingdoms = new Map();
  const towns = world.towns.map((t) => {
    // District names are folder names; number them instead, in a stable order.
    const order = t.districts.map((d) => d.name).sort();
    const districtName = (name) => (order.includes(name) ? `Distrik ${order.indexOf(name) + 1}` : 'Distrik');
    // Kingdoms stay grouped, but anonymously.
    if (t.owner && !kingdoms.has(t.owner)) kingdoms.set(t.owner, `Kerajaan ${kingdoms.size + 1}`);
    return {
      id: opaque(t.id),
      town: t.town,
      name: '',
      owner: t.owner ? kingdoms.get(t.owner) : '',
      root: null,
      branch: '',
      districts: t.districts.map((d) => ({ ...d, name: districtName(d.name) })),
      commits: t.commits.map((c) => ({ hash: '', at: c.at, author: '', subject: '', added: c.added, removed: c.removed, districts: c.districts.map(districtName) })),
      totals: t.totals,
      growth: t.growth,
      tier: t.tier,
      mood: t.mood,
      biome: t.biome,
      error: t.error ? 'error' : undefined,
      agents: t.agents.map((a) => publicAgent(a, districtName)),
      active: t.active,
      lastSeenMs: t.lastSeenMs,
    };
  });
  return { ...world, towns, public: true };
}

/** Party-window sessions with the same stripping. */
export function publicSessions(data) {
  return {
    ...data,
    public: true,
    sessions: (data.sessions ?? []).map((s) => ({
      ...publicAgent(s, () => 'Distrik'),
      map: '', cwd: '', branch: '', party: [],
    })),
  };
}

/**
 * Replay timelines for public mode: ids made opaque to match publicWorld,
 * buildings renamed to the same numbered districts, and every piece of text
 * (labels, file names, prompts, replies) dropped.
 */
export function publicTimelines(world, pub) {
  const timelines = {};
  world.towns.forEach((t) => {
    const order = t.districts.map((d) => d.name).sort();
    const districtName = (name) => (name && order.includes(name) ? `Distrik ${order.indexOf(name) + 1}` : null);
    for (const a of t.agents) {
      const events = world.timelines[a.id];
      if (!events) continue;
      timelines[opaque(a.id)] = events.map((e) => ({
        t: e.t, type: e.type, id: e.id, kind: e.kind, name: e.name, error: e.error, hp: e.hp,
        building: e.type === 'tool' ? districtName(e.building) : undefined,
      }));
    }
  });
  return { ...pub, from: world.from, to: world.to, timelines };
}
