import { listSessions } from './sources/claude-code.mjs';
import { repoRootOf, repoStats, districtOfFile } from './repos.mjs';
import { loadConfig, visible, publicWorld } from './privacy.mjs';
import { redact } from './activity.mjs';

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
const FIELD = { id: 'field', town: 'Prontera Field', name: 'tanpa repo', owner: '', districts: [], commits: [] };

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

export async function buildWorld() {
  // Read first: redaction words are applied while transcripts are parsed.
  const config = loadConfig();
  const { sessions, error, scannedAt } = await listSessions();
  if (error) return { error, towns: [], scannedAt };

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
  const world = { towns: out, scannedAt, configError: config.error ?? undefined };
  return config.public ? publicWorld(world) : world;
}
