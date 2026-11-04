/**
 * Build the online demo: a static copy of web/ that plays back a recording
 * of the living simulation, for GitHub Pages or any static host.
 *
 *   node scripts/build-pages.mjs [--seconds 240] [--out _site]
 *
 * It starts `scripts/simulate.mjs` on a spare port (fake agents in fake repos
 * under the temp folder), records the world and party streams plus a replay
 * of the run, then writes web/ with scripts/pages/shim.js wired in. No real
 * session or repo of this machine ends up in the output.
 */
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, basename, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const SECONDS = Number(arg('seconds', 240));
const WARMUP_SECONDS = Number(arg('warmup', 10));
const OUT = resolve(ROOT, arg('out', '_site'));
const PORT = Number(arg('port', 4329));
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!(SECONDS >= 10)) throw new Error('--seconds must be at least 10');
if (OUT === ROOT || !OUT.startsWith(ROOT)) throw new Error(`refusing to write outside the repo: ${OUT}`);

/* ── Run the simulation ─────────────────────────────────────────────────── */

const sim = spawn(process.execPath, [join(ROOT, 'scripts/simulate.mjs')], {
  cwd: ROOT,
  env: {
    ...process.env,
    KAFRA_PORT: String(PORT),
    KAFRA_NO_OPEN: '1',
    KAFRA_SOURCES: 'claude-code',
    KAFRA_EXP_FILE: join(tmpdir(), 'kafra-pages-exp.json'),
    KAFRA_CONFIG: join(tmpdir(), 'kafra-pages-no-config.json'),
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const stop = () => { if (sim.exitCode === null) sim.kill(); };
process.on('exit', stop);
sim.on('exit', (code) => { if (code && !stopping) { console.error(`simulation exited with ${code}`); process.exit(1); } });
let stopping = false;

// A fresh EXP file, so achievements and levels start from zero like a new install.
rmSync(join(tmpdir(), 'kafra-pages-exp.json'), { force: true });

for (let i = 0; ; i++) {
  try { if ((await fetch(BASE + '/')).ok) break; } catch {}
  if (i > 1200) throw new Error('simulation did not start in 10 minutes');
  await sleep(500);
}
console.log(`🎬 warming up ${WARMUP_SECONDS}s, then recording ${SECONDS}s`);
await sleep(WARMUP_SECONDS * 1000);

/* ── Record the streams ─────────────────────────────────────────────────── */

// The simulated repos live under the temp folder; show them as plain repo
// names ("guild-hall-api/src/…") instead of the recording machine's paths.
// The server writes paths with "/" on every OS, so look for both spellings.
const simRoots = [...new Set([tmpdir(), realpathSync(tmpdir())].flatMap((t) => {
  const root = join(t, 'kafra-sim', 'repos') + sep;
  return [root, root.split(sep).join('/')];
}))];
const escaped = (s) => JSON.stringify(s).slice(1, -1);
const tidy = (raw) => simRoots.reduce((text, root) => text.split(escaped(root)).join('').split(escaped(root.slice(0, -1))).join(''), raw);

/** Every `data:` payload of a server-sent event stream until `until`, timed from `start`. */
async function record(path, start, until) {
  const frames = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), until - Date.now());
  try {
    const res = await fetch(BASE + path, { signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = tidy(event.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n'));
        if (!data) continue;
        // The same world twice in a row adds nothing to play back.
        if (frames.length && frames.at(-1).raw === data) continue;
        frames.push({ t: Math.max(0, Date.now() - start), raw: data });
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') throw err;
  } finally {
    clearTimeout(timer);
  }
  return frames.map(({ t, raw }) => ({ t, d: JSON.parse(raw) }));
}

const start = Date.now();
const end = start + SECONDS * 1000;
const [world, party] = await Promise.all([
  record('/api/world/stream', start, end),
  record('/api/stream', start, end),
]);
const replayRes = await fetch(`${BASE}/api/replay?from=${start - 60_000}&to=${end}`);
if (!replayRes.ok) throw new Error(`replay: ${await replayRes.text()}`);
const replay = JSON.parse(tidy(await replayRes.text()));
stopping = true;
stop();

if (world.length < 3) throw new Error(`only ${world.length} world frames recorded`);
console.log(`📼 ${world.length} world frames, ${party.length} party frames`);

/* ── Write the site ─────────────────────────────────────────────────────── */

rmSync(OUT, { recursive: true, force: true });
// Same rule as the npm package: web/_* are local scratch files.
cpSync(join(ROOT, 'web'), OUT, { recursive: true, filter: (src) => !basename(src).startsWith('_') });
mkdirSync(join(OUT, 'demo'), { recursive: true });
cpSync(join(ROOT, 'scripts/pages/shim.js'), join(OUT, 'demo/shim.js'));
writeFileSync(join(OUT, 'demo/recording.json'), JSON.stringify({ start, end, world, party, replay }));
// GitHub Pages would otherwise run Jekyll and drop files that start with "_".
writeFileSync(join(OUT, '.nojekyll'), '');

for (const page of ['index.html', 'party.html']) {
  const file = join(OUT, page);
  const html = readFileSync(file, 'utf8');
  const tag = '<script src="demo/shim.js"></script>';
  if (!html.includes('<head>')) throw new Error(`${page}: no <head> to put the demo player in`);
  writeFileSync(file, html.replace('<head>', `<head>\n${tag}`));
}

const mb = (statSync(join(OUT, 'demo/recording.json')).size / 1e6).toFixed(1);
console.log(`✅ ${OUT} (recording ${mb} MB)`);
process.exit(0);
