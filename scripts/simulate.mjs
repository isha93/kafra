/**
 * A living demo: fake agents working in fake repos, forever.
 *
 *   npm run simulate        → http://localhost:4319
 *
 * Everything happens under the OS temp dir: three throwaway git repos and the
 * transcripts of four scripted agents. Agents read, edit real files in those
 * repos (scaffolding), run tests that sometimes fail (rain), spawn subagents,
 * search the web and commit for real (fireworks). Your own repos and
 * ~/.claude are never touched, and nothing calls a model.
 */
import { mkdirSync, writeFileSync, appendFileSync, rmSync, realpathSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(tmpdir(), 'kafra-sim');
const PROJECTS = join(ROOT, 'projects');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const jitter = (ms) => ms * (0.7 + Math.random() * 0.6);

/* ── Repos ──────────────────────────────────────────────────────────────── */

const REPOS = {
  'guild-hall-api': ['src/routes/index.ts', 'src/routes/quests.ts', 'src/db/schema.ts', 'tests/quests.test.ts', 'docs/api.md', 'README.md'],
  'tavern-ios': ['App/TavernApp.swift', 'Features/Inventory/InventoryView.swift', 'Features/Inventory/InventoryStore.swift', 'Features/Quests/QuestList.swift', 'Tests/InventoryTests.swift', 'README.md'],
  'market-web': ['web/index.html', 'web/cart.js', 'src/pricing.ts', 'src/catalog.ts', 'scripts/seed.ts', 'README.md'],
  'dungeon-crawler': ['engine/map.rs', 'engine/combat.rs', 'assets/tiles.json', 'levels/floor1.json', 'tests/combat_test.rs', 'README.md'],
  'alchemy-pipeline': ['pipeline/ingest.py', 'pipeline/transform.py', 'models/recipe.py', 'notebooks/explore.ipynb', 'tests/test_transform.py', 'README.md'],
  'bard-blog': ['content/posts/hello.md', 'content/posts/ballads.md', 'theme/layout.html', 'theme/style.css', 'config/site.toml', 'README.md'],
};

function git(cwd, ...args) {
  return execFileSync('git', ['-c', 'user.name=Kafra Sim', '-c', 'user.email=sim@kafra.local', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' }).toString();
}

/**
 * How big and how old each fake repo is, so the world shows every tier:
 * extra files are padded into the repo's own folders, and history is
 * backdated commits spread from `ageDays` ago to `lastDaysAgo`, with `recent`
 * of them in the last month.
 */
const HISTORY = {
  'guild-hall-api': { files: 2100, commits: 520, ageDays: 400, lastDaysAgo: 0, recent: 40 },   // capital, busy
  'tavern-ios': { files: 620, commits: 170, ageDays: 210, lastDaysAgo: 1, recent: 12 },        // city
  'market-web': { files: 160, commits: 55, ageDays: 90, lastDaysAgo: 2, recent: 8 },           // town
  'dungeon-crawler': { files: 40, commits: 14, ageDays: 40, lastDaysAgo: 3, recent: 6 },       // village
  'alchemy-pipeline': { files: 0, commits: 2, ageDays: 3, lastDaysAgo: 0, recent: 2 },         // camp
  'bard-blog': { files: 60, commits: 20, ageDays: 300, lastDaysAgo: 60, recent: 0 },           // village, abandoned until someone commits
};

const DAY = 86_400_000;

function backdated(dir, message, at) {
  const date = new Date(at).toISOString();
  execFileSync('git', ['-c', 'user.name=Kafra Sim', '-c', 'user.email=sim@kafra.local', '-c', 'commit.gpgsign=false', 'commit', '-qam', message], {
    cwd: dir, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

function makeRepos() {
  const out = {};
  for (const [name, files] of Object.entries(REPOS)) {
    const dir = join(ROOT, 'repos', name);
    const h = HISTORY[name];
    for (const f of files) {
      mkdirSync(dirname(join(dir, f)), { recursive: true });
      writeFileSync(join(dir, f), `// ${f}\n`);
    }
    // Pad with files of the repo's own languages, spread over its folders.
    const folders = [...new Set(files.filter((f) => f.includes('/')).map((f) => f.split('/')[0]))];
    const exts = [...new Set(files.map((f) => f.split('.').pop()).filter((e) => e !== 'md'))];
    for (let i = 0; i < h.files; i++) {
      const f = join(dir, folders[i % folders.length], 'more', `part${i}.${exts[i % exts.length]}`);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, `// ${i}\n`);
    }
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'remote', 'add', 'origin', `https://github.com/adventurers/${name}.git`);
    git(dir, 'add', '-A');
    const now = Date.now();
    const first = now - h.ageDays * DAY;
    const last = now - h.lastDaysAgo * DAY;
    backdated(dir, 'initial commit', first);
    const older = h.commits - 1 - h.recent;
    for (let i = 0; i < h.commits - 1; i++) {
      appendFileSync(join(dir, 'README.md'), `${i}\n`);
      // Older commits spread over the early history; recent ones over the last month.
      const at = i < older
        ? first + ((Math.min(last, now - 31 * DAY) - first) * (i + 1)) / (older + 1)
        : now - 29 * DAY + ((last - (now - 29 * DAY)) * (i - older + 1)) / (h.recent + 1);
      // A young repo's "last month" starts at its first commit.
      backdated(dir, `chore: step ${i}`, Math.max(first, Math.min(at, last)));
    }
    // Transcripts record real paths; macOS tmp is a symlink into /private.
    out[name] = realpathSync(dir);
  }
  return out;
}

/* ── Transcripts ────────────────────────────────────────────────────────── */

let ids = 0;

class Agent {
  constructor({ repo, model, sidechain = false, file, sessionId }) {
    this.repo = repo;
    this.model = model;
    this.sessionId = sessionId ?? `sim-${++ids}`;
    this.file = file ?? join(PROJECTS, repo.replace(/\//g, '-'), `${this.sessionId}.jsonl`);
    this.sidechain = sidechain;
    this.tokens = 60_000 + Math.random() * 80_000;
    mkdirSync(dirname(this.file), { recursive: true });
  }

  write(rec) {
    appendFileSync(this.file, JSON.stringify({
      cwd: this.repo, gitBranch: 'main', sessionId: this.sessionId, isSidechain: this.sidechain,
      version: 'sim', timestamp: new Date().toISOString(), ...rec,
    }) + '\n');
  }

  usage() {
    this.tokens += 4_000 + Math.random() * 9_000;
    return { input_tokens: 20, cache_read_input_tokens: Math.round(this.tokens), cache_creation_input_tokens: 0, output_tokens: 80 };
  }

  prompt(text, title) {
    this.write({ type: 'user', message: { role: 'user', content: text } });
    if (title) this.write({ type: 'ai-title', aiTitle: title });
  }

  say(text) {
    this.write({ type: 'assistant', message: { model: this.model, usage: this.usage(), content: [{ type: 'text', text }] } });
  }

  /** Start a tool call; returns a function that finishes it. */
  tool(name, input) {
    const id = `toolu_sim_${++ids}`;
    this.write({ type: 'assistant', message: { model: this.model, usage: this.usage(), content: [{ type: 'tool_use', id, name, input }] } });
    return (error = false, content = 'ok') => this.write({
      type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error: error }] },
    });
  }
}

/* ── Stories ────────────────────────────────────────────────────────────── */

/**
 * A step is [tool, input, seconds, effect?]. Effects: 'edit' appends to the
 * file, 'commit' commits the repo, 'fail' returns an error, 'spawn' runs a
 * subagent alongside.
 */
const QUESTS = {
  'guild-hall-api': [
    {
      title: 'Tambah endpoint papan quest', prompt: 'tambahin endpoint GET /quests dengan filter rank',
      steps: [
        ['Read', { file_path: 'src/routes/index.ts' }, 3],
        ['Grep', { pattern: 'router\\.get' }, 2],
        ['Read', { file_path: 'src/db/schema.ts' }, 3],
        ['Edit', { file_path: 'src/routes/quests.ts' }, 5, 'edit'],
        ['Edit', { file_path: 'src/db/schema.ts' }, 4, 'edit'],
        ['Write', { file_path: 'tests/quests.test.ts' }, 4, 'edit'],
        ['Bash', { command: 'npm test', description: 'Jalankan test' }, 6],
        ['Bash', { command: 'git commit -am "feat: quest board endpoint"', description: 'Commit endpoint quest' }, 3, 'commit'],
      ],
      done: 'Endpoint /quests sudah jadi, test hijau. Mau sekalian paginasi?',
    },
    {
      title: 'Dokumentasi API', prompt: 'update docs api biar sesuai endpoint baru',
      steps: [
        ['Read', { file_path: 'docs/api.md' }, 3],
        ['WebFetch', { url: 'https://spec.openapis.org/oas/latest.html' }, 5],
        ['Edit', { file_path: 'docs/api.md' }, 6, 'edit'],
        ['Edit', { file_path: 'README.md' }, 3, 'edit'],
        ['Bash', { command: 'git commit -am "docs: quests api"', description: 'Commit dokumentasi' }, 3, 'commit'],
      ],
      done: 'Docs sudah update.',
    },
  ],
  'tavern-ios': [
    {
      title: 'Perbaiki crash inventory', prompt: 'app crash pas buka inventory kosong, benerin',
      steps: [
        ['Grep', { pattern: 'items\\[0\\]' }, 2],
        ['Read', { file_path: 'Features/Inventory/InventoryStore.swift' }, 3],
        ['Read', { file_path: 'Features/Inventory/InventoryView.swift' }, 3],
        ['Edit', { file_path: 'Features/Inventory/InventoryStore.swift' }, 5, 'edit'],
        ['Bash', { command: 'xcodebuild -scheme Tavern test', description: 'Jalankan unit test' }, 7, 'fail'],
        ['Read', { file_path: 'Tests/InventoryTests.swift' }, 3],
        ['Edit', { file_path: 'Tests/InventoryTests.swift' }, 4, 'edit'],
        ['Edit', { file_path: 'Features/Inventory/InventoryView.swift' }, 4, 'edit'],
        ['Bash', { command: 'xcodebuild -scheme Tavern test', description: 'Jalankan unit test lagi' }, 7],
        ['Bash', { command: 'git commit -am "fix: empty inventory crash"', description: 'Commit perbaikan' }, 3, 'commit'],
      ],
      done: 'Crash sudah beres, ada test baru buat inventory kosong.',
    },
    {
      title: 'Layar daftar quest', prompt: 'bikin QuestList pakai SwiftUI List',
      steps: [
        ['Read', { file_path: 'Features/Quests/QuestList.swift' }, 3],
        ['WebSearch', { query: 'SwiftUI List swipe actions iOS 18' }, 5],
        ['Edit', { file_path: 'Features/Quests/QuestList.swift' }, 6, 'edit'],
        ['Edit', { file_path: 'App/TavernApp.swift' }, 3, 'edit'],
        ['Bash', { command: 'xcodebuild -scheme Tavern build', description: 'Build app' }, 6],
      ],
      done: 'QuestList sudah ada. Mau gw commit?',
    },
  ],
  'market-web': [
    {
      title: 'Audit harga & keranjang', prompt: 'cek kenapa total keranjang kadang salah',
      steps: [
        ['Agent', { description: 'Telusuri alur harga', subagent_type: 'Explore' }, 14, 'spawn'],
        ['Read', { file_path: 'src/pricing.ts' }, 3],
        ['Edit', { file_path: 'src/pricing.ts' }, 5, 'edit'],
        ['Edit', { file_path: 'web/cart.js' }, 4, 'edit'],
        ['Bash', { command: 'npm test', description: 'Jalankan test' }, 5],
        ['Bash', { command: 'git commit -am "fix: rounding in cart total"', description: 'Commit perbaikan harga' }, 3, 'commit'],
      ],
      done: 'Ketemu: pembulatan per item, bukan per total. Sudah dibenerin.',
    },
    {
      title: 'Seed katalog', prompt: 'bikin script seed katalog barang',
      steps: [
        ['Read', { file_path: 'src/catalog.ts' }, 3],
        ['Write', { file_path: 'scripts/seed.ts' }, 5, 'edit'],
        ['Bash', { command: 'node scripts/seed.ts', description: 'Jalankan seed' }, 4],
        ['Edit', { file_path: 'web/index.html' }, 4, 'edit'],
      ],
      done: 'Seed jalan, 120 barang masuk.',
    },
  ],
};

/**
 * Repos without handwritten quests get stories built from their own files:
 * a feature, a bugfix whose first test run fails, docs, and a research errand.
 */
function generatedQuests(name) {
  const files = REPOS[name].filter((f) => f !== 'README.md');
  const testFile = files.find((f) => /test/.test(f)) ?? files[0];
  const code = files.filter((f) => f !== testFile);
  const [a, b, c] = [pick(code), pick(code), pick(code)];
  const test = { command: 'npm test', description: 'Jalankan test' };
  return [
    {
      title: `Fitur baru di ${a.split('/')[0]}`, prompt: `tambahin fitur baru di ${a}`,
      steps: [
        ['Read', { file_path: a }, 3], ['Grep', { pattern: 'TODO|FIXME' }, 2],
        ['Edit', { file_path: a }, 5, 'edit'], ['Edit', { file_path: b }, 4, 'edit'],
        ['Bash', test, 5], ['Bash', { command: `git commit -am "feat: ${a.split('/').pop()}"`, description: 'Commit fitur' }, 3, 'commit'],
      ],
      done: 'Fiturnya udah jadi.',
    },
    {
      title: 'Kejar bug misterius', prompt: `ada bug aneh di ${b}, tolong cek`,
      steps: [
        ['Read', { file_path: b }, 3], ['Read', { file_path: testFile }, 3],
        ['Edit', { file_path: b }, 4, 'edit'], ['Bash', test, 6, 'fail'],
        ['Edit', { file_path: testFile }, 4, 'edit'], ['Edit', { file_path: b }, 4, 'edit'],
        ['Bash', test, 6], ['Bash', { command: 'git commit -am "fix: edge case"', description: 'Commit perbaikan' }, 3, 'commit'],
      ],
      done: 'Bug-nya ketemu dan udah ada test-nya.',
    },
    {
      title: 'Riset & rapihin', prompt: `pelajari ${c} terus rapihin`,
      steps: [
        ['Agent', { description: `Pelajari ${c.split('/')[0]}`, subagent_type: 'Explore' }, 12, 'spawn'],
        ['WebSearch', { query: `best practices ${c.split('.').pop()}` }, 4],
        ['Edit', { file_path: c }, 5, 'edit'], ['Edit', { file_path: 'README.md' }, 3, 'edit'],
      ],
      done: 'Udah dirapihin. Mau di-commit?',
    },
  ];
}
for (const name of Object.keys(REPOS)) QUESTS[name] ??= generatedQuests(name);

const SUBAGENT_STEPS = [
  ['Grep', { pattern: 'price|total' }, 2],
  ['Read', { file_path: 'src/pricing.ts' }, 3],
  ['Read', { file_path: 'web/cart.js' }, 3],
  ['Read', { file_path: 'src/catalog.ts' }, 3],
];

async function runSteps(agent, steps, repoDir) {
  for (const [name, input, seconds, effect] of steps) {
    const full = { ...input };
    if (full.file_path) full.file_path = join(repoDir, full.file_path);
    const finish = agent.tool(name, full);
    let spawned = null;
    if (effect === 'spawn') spawned = runSubagent(agent, repoDir, input.description);
    await sleep(jitter(seconds * 1000));
    await spawned;
    if (effect === 'edit') appendFileSync(full.file_path, `// edited ${new Date().toISOString()}\n`);
    if (effect === 'commit') {
      try { git(repoDir, 'add', '-A'); git(repoDir, 'commit', '-qm', input.command.match(/"(.*)"/)?.[1] ?? 'update'); } catch { /* nothing to commit */ }
    }
    finish(effect === 'fail', effect === 'fail' ? 'Test failed: InventoryTests.testEmpty' : 'ok');
    // A beat of "thinking" between tools.
    await sleep(jitter(1200));
  }
}

/** Subagents explore whatever exists in the leader's repo. */
function subagentSteps(repoDir) {
  const name = Object.keys(REPOS).find((n) => repoDir.endsWith(`/${n}`));
  if (name === 'market-web') return SUBAGENT_STEPS;
  const files = REPOS[name];
  return [['Grep', { pattern: 'class|function|struct' }, 2], ...[pick(files), pick(files), pick(files)].map((f) => ['Read', { file_path: f }, 3])];
}

async function runSubagent(leader, repoDir, description) {
  const file = join(dirname(leader.file), leader.sessionId, 'subagents', `agent-sim${++ids}.jsonl`);
  const sub = new Agent({ repo: repoDir, model: 'claude-haiku-5-5', sidechain: true, file, sessionId: leader.sessionId });
  writeFileSync(file.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: 'Explore', description }));
  sub.prompt(description);
  await runSteps(sub, subagentSteps(repoDir), repoDir);
  sub.say('Selesai menelusuri.');
}

async function live(agent, repoName, repoDir, offset) {
  await sleep(offset);
  let i = Math.floor(Math.random() * QUESTS[repoName].length);
  for (;;) {
    const quest = QUESTS[repoName][i++ % QUESTS[repoName].length];
    agent.prompt(quest.prompt, quest.title);
    await sleep(jitter(1500));
    await runSteps(agent, quest.steps, repoDir);
    agent.say(quest.done);
    // Waiting for "you" before the next quest.
    await sleep(jitter(9000));
    // Long sessions eventually compact; reset HP so the bar keeps moving.
    if (agent.tokens > 850_000) agent.tokens = 80_000;
  }
}

/* ── Main ───────────────────────────────────────────────────────────────── */

if (ROOT.length < 12 || !ROOT.startsWith(tmpdir())) throw new Error(`refusing to wipe ${ROOT}`);
if (existsSync(ROOT)) rmSync(ROOT, { recursive: true, force: true });
const repos = makeRepos();

// Every town gets at least one adventurer, and every job class shows up.
// An unrecognised model plays the Novice.
const cast = [
  { repo: 'guild-hall-api', model: 'claude-opus-5-5', offset: 0 },
  { repo: 'guild-hall-api', model: 'claude-fable-5-1', offset: 6000 },
  { repo: 'tavern-ios', model: 'claude-sonnet-5-5', offset: 1000 },
  { repo: 'tavern-ios', model: 'claude-haiku-5-5', offset: 8000 },
  { repo: 'market-web', model: 'claude-haiku-5-5', offset: 2000 },
  { repo: 'dungeon-crawler', model: 'claude-opus-5-5', offset: 500 },
  { repo: 'dungeon-crawler', model: 'sim-apprentice', offset: 5000 },
  { repo: 'alchemy-pipeline', model: 'claude-sonnet-5-5', offset: 1500 },
  { repo: 'bard-blog', model: 'claude-fable-5-1', offset: 2500 },
  { repo: 'bard-blog', model: 'sim-apprentice', offset: 7000 },
];
for (const c of cast) {
  const agent = new Agent({ repo: repos[c.repo], model: c.model });
  live(agent, c.repo, repos[c.repo], c.offset);
}

process.env.KAFRA_PROJECTS_DIR = PROJECTS;
// Only the simulated transcripts; this machine's real Codex/Gemini sessions stay out.
process.env.KAFRA_SOURCES ??= 'claude-code';
process.env.KAFRA_PORT ??= '4319';
await import('../src/server.mjs');
console.log(`   simulasi: ${cast.length} adventurer, ${Object.keys(REPOS).length} kota di ${ROOT}`);
