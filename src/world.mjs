import { listSessions, replaySessions } from './sources/index.mjs';
import { repoRootOf, repoStats, districtOfFile, commitsBetween } from './repos.mjs';
import { loadConfig, visible, publicWorld, publicTimelines } from './privacy.mjs';
import { redact } from './activity.mjs';
import { serverLang } from '../web/city/i18n.js';
import { ExpBook } from './exp.mjs';

/** The language of this machine's user; the browser follows it unless told otherwise. */
const LANG = serverLang();

/**
 * One repo, one town.
 *
 * Town names are borrowed from Rune-Midgard by a stable hash of the repo path,
 * so a repo keeps its town across restarts. Names only — no assets. The real
 * repo name is always shown next to it.
 */
const TOWN_NAMES = [
  'Prontera', 'Geffen', 'Payon', 'Morroc', 'Alberta', 'Izlude', 'Aldebaran',
  'Comodo', 'Juno', 'Lutie', 'Amatsu', 'Hugel', 'Einbroch', 'Lighthalzen',
  'Rachel', 'Veins', 'Umbala', 'Niflheim', 'Ayothaya', 'Louyang',
];

function hash(s) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Hash each repo to a name, probing past names already taken. Roots are sorted
 * first so the same set of repos always gets the same names.
 */
function townNames(roots) {
  const taken = new Set();
  const out = new Map();
  for (const root of [...roots].sort()) {
    let i = hash(root) % TOWN_NAMES.length;
    for (let n = 0; n < TOWN_NAMES.length && taken.has(TOWN_NAMES[i]); n++) i = (i + 1) % TOWN_NAMES.length;
    const name = taken.has(TOWN_NAMES[i]) ? `${TOWN_NAMES[i]} ${taken.size}` : TOWN_NAMES[i];
    taken.add(name);
    out.set(root, name);
  }
  return out;
}

/** Sessions outside any git repo still need somewhere to stand. */
const FIELD = { id: 'field', town: 'Prontera Field', name: '', owner: '', districts: [], commits: [] };

/**
 * Which building an agent should stand at.
 *
 * Writing a file sends it to the district that owns the file; everything else
 * goes to the civic building for that kind of work. The client places civic
 * buildings itself, so only a name travels.
 */
function placeAgent(agent, root, districtNames) {
  const file = agent.tool?.file ?? null;
  const district = root ? districtOfFile(root, file) : null;
  if (agent.kind === 'build' && district) {
    return { building: districtNames.includes(district) ? district : '(root)', file: relFile(root, file) };
  }
  return { building: null, file: root && file ? relFile(root, file) : file };
}

function relFile(root, file) {
  if (!file) return null;
  return file.startsWith(root + '/') ? file.slice(root.length + 1) : file;
}

/** Districts each agent wrote to recently, so buildings can show who has been there. */
function touchedDistricts(agent, root) {
  const out = new Set();
  for (const t of agent.tools) {
    if (t.kind !== 'build') continue;
    const d = districtOfFile(root, t.file);
    if (d) out.add(d);
  }
  return [...out];
}

/** Sessions → towns: one per repo, with stats, placed agents and party members. */
async function townsFrom(sessions, config) {
  const towns = new Map();

  for (const s of sessions) {
    // Hidden repos are dropped before git is ever run on them.
    if (!visible(s.cwd, config)) continue;
    const root = await repoRootOf(s.cwd);
    if (root && !visible(root, config)) continue;
    const key = root ?? 'field';
    if (!towns.has(key)) {
      towns.set(key, { root, agents: [] });
    }
    towns.get(key).agents.push(s);
  }

  const names = townNames([...towns.values()].map((t) => t.root).filter(Boolean));
  const out = [];
  for (const [key, { root, agents }] of towns) {
    const stats = root ? await repoStats(root) : FIELD;
    const districtNames = (stats.districts ?? []).map((d) => d.name);
    const placed = [];

    for (const a of agents) {
      const { party = [], ...rest } = a;
      for (const member of [rest, ...party]) {
        placed.push({
          ...member,
          leader: member === rest ? null : rest.id,
          ...placeAgent(member, root, districtNames),
          touched: root ? touchedDistricts(member, root) : [],
        });
      }
    }

    const lastSeen = Math.min(...agents.map((a) => a.ageMs));
    out.push({
      id: key,
      town: root ? names.get(root) : FIELD.town,
      // Repo, owner, branch and commit text can name a client too, so they get
      // the same redaction as transcript text.
      name: redact(stats.name ?? FIELD.name),
      owner: redact(stats.owner ?? ''),
      root,
      branch: redact(stats.branch ?? ''),
      districts: stats.districts ?? [],
      commits: (stats.commits ?? []).map((c) => ({ ...c, subject: redact(c.subject), author: redact(c.author) })),
      totals: stats.totals ?? { files: 0, commitsWeek: 0, dirty: 0 },
      growth: stats.growth ?? null,
      tier: stats.tier ?? { id: 'camp', name: 'Camp', stars: 1, cap: 1, next: null },
      mood: stats.mood ?? 'abandoned',
      biome: stats.biome ?? { id: 'plains', name: 'Padang' },
      error: stats.error,
      agents: placed,
      active: placed.filter((p) => p.status === 'active').length,
      lastSeenMs: lastSeen,
    });
  }

  // Busy towns first, then most recently visited.
  out.sort((a, b) => b.active - a.active || a.lastSeenMs - b.lastSeenMs);
  return out;
}

/** EXP per adventurer (exp.mjs), opened on the first scan so tests and imports never touch the file. */
let book = null;
/** Write EXP now, e.g. on shutdown; scans otherwise save at most every 30 s. */
export const saveExp = () => book?.dirty && book.save();

export async function buildWorld() {
  // Read first: redaction words are applied while transcripts are parsed.
  const config = loadConfig();
  const { sessions, error, scannedAt } = await listSessions();
  if (error) return { error, towns: [], scannedAt };
  const towns = await townsFrom(sessions, config);
  (book ??= new ExpBook()).observe(towns);
  const world = { towns, scannedAt, lang: LANG, configError: config.error ?? undefined };
  return config.public ? publicWorld(world) : world;
}

/* ── Replay ─────────────────────────────────────────────────────────────── */

const REPLAY_SPAN_MAX = 2 * 86_400_000;
const REPLAY_CACHE_DAYS = 3;
const REPLAY_CACHE_MS = 10 * 60_000;
const replayCache = new Map();

/**
 * A stretch of history as towns plus one timeline per agent. The client
 * replays it by asking "what was each agent doing at time t", so the server
 * sends events, not frames.
 *
 * Towns, privacy and public mode work exactly as in the live world; event
 * text is redacted the same way, and stripped entirely in public mode.
 */
export async function buildReplay({ from, to }) {
  to = Math.min(to, Date.now());
  if (!(to > from) || to - from > REPLAY_SPAN_MAX) throw new Error('invalid replay range (at most 2 days)');
  const key = `${from}-${to}`;
  const hit = replayCache.get(key);
  // A finished day never changes, so it is kept for a while; today is re-read
  // every 20 seconds at most. Either way only a few days stay in memory: a
  // day costs ~20 MB parsed, and re-reading one from disk takes under a second.
  const fresh = hit && (to < Date.now() - 60_000 ? Date.now() - hit.at < REPLAY_CACHE_MS : Date.now() - hit.at < 20_000);
  if (fresh) return hit.promise;
  const promise = computeReplay(from, to);
  replayCache.delete(key);
  replayCache.set(key, { at: Date.now(), promise });
  while (replayCache.size > REPLAY_CACHE_DAYS) replayCache.delete(replayCache.keys().next().value);
  return promise;
}

async function computeReplay(from, to) {
  const config = loadConfig();
  const raw = await replaySessions({ from, to });

  // Shape them like live sessions so the same town builder applies: everyone
  // starts asleep; the client wakes them as their events come up.
  const byId = new Map(raw.map((r) => [r.id, r]));
  const asSession = (r) => ({
    ...r, kind: 'resting', status: 'resting', tools: [], tool: null, hp: 100, tokens: 0,
    quest: r.title, preview: '', lastSeen: new Date(r.events.at(-1).t).toISOString(),
    ageMs: Date.now() - r.events.at(-1).t, party: [],
  });
  const leaders = raw.filter((r) => !r.leader || !byId.has(r.leader)).map(asSession);
  const leaderById = new Map(leaders.map((l) => [l.id, l]));
  for (const r of raw) if (r.leader && leaderById.has(r.leader)) leaderById.get(r.leader).party.push(asSession(r));

  const towns = await townsFrom(leaders, config);
  const timelines = {};
  for (const town of towns) {
    const names = town.districts.map((d) => d.name);
    // The stretch's own commits, not just the last week's.
    if (town.root) {
      town.commits = (await commitsBetween(town.root, from, to)).map((c) => ({ ...c, subject: redact(c.subject), author: redact(c.author) }));
    }
    for (const d of town.districts) d.dirty = 0;
    for (const a of town.agents) {
      const r = byId.get(a.id);
      if (!r) continue;
      let lastHp = null;
      timelines[a.id] = r.events.flatMap((e) => {
        // HP changes slowly; one event per point of change is plenty.
        if (e.type === 'hp') {
          if (e.hp === lastHp) return [];
          lastHp = e.hp;
          return [e];
        }
        if (e.type !== 'tool') return [e];
        const district = town.root ? districtOfFile(town.root, e.file) : null;
        return [{
          ...e,
          label: e.label ? redact(e.label) : undefined,
          file: town.root && e.file ? relFile(town.root, e.file) : e.file,
          building: e.kind === 'build' && district ? (names.includes(district) ? district : '(root)') : null,
        }];
      });
    }
  }
  const world = { from, to, towns, timelines, lang: LANG, configError: config.error ?? undefined };
  return config.public ? publicTimelines(world, publicWorld(world)) : world;
}
