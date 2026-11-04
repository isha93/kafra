import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS_DIR } from './sources/claude-code.mjs';
import { listSessions } from './sources/index.mjs';
import { CODEX_DIR } from './sources/codex.mjs';
import { GEMINI_DIR } from './sources/gemini.mjs';
import { CURSOR_DIR } from './sources/cursor.mjs';
import { OPENCODE_DIR } from './sources/opencode.mjs';
import { buildWorld, buildReplay, saveExp } from './world.mjs';
import { allowedHost, allowedOrigin, SECURITY_HEADERS } from './guard.mjs';
import { loadConfig, visible, publicSessions, CONFIG_PATH } from './privacy.mjs';
import { swiftbarText } from './menubar.mjs';
import { startWatching, changeVersion, nextChange } from './watch.mjs';

/** The party window's sessions, through the same privacy rules as the world. */
async function sessionsView() {
  const config = loadConfig();
  const data = await listSessions();
  data.sessions = (data.sessions ?? []).filter((s) => visible(s.cwd, config));
  return config.public ? publicSessions(data) : data;
}

const PORT = Number(process.env.KAFRA_PORT ?? 4317);

/**
 * Loopback only, never 0.0.0.0.
 *
 * This server hands out the contents of your Claude Code transcripts — working
 * directories, branch names, the text of what you and the model said. Binding to
 * every interface would publish all of that to anyone on the same WiFi.
 */
const HOST = '127.0.0.1';

const WEB = resolve(fileURLToPath(new URL('../web/', import.meta.url)));

// PixiJS lives in web/vendor/ (see scripts/vendor-pixi.mjs) and is served
// like any other static file: no node_modules at runtime.

/** A burst of writes (an agent mid-turn) rebuilds the world at most this often. */
const MIN_GAP_MS = 1500;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function send(res, code, type, body) {
  res.writeHead(code, { ...SECURITY_HEADERS, 'content-type': type });
  res.end(body);
}

async function serveStatic(path, res) {
  let rel;
  try { rel = decodeURIComponent(path === '/' ? 'index.html' : path.slice(1)); } catch { return send(res, 400, 'text/plain', 'bad path'); }
  // Resolve, then require the result to still be inside web/: catches "..", encoded
  // "%2e%2e", absolute paths and NUL bytes alike.
  const file = resolve(WEB, rel);
  if (!file.startsWith(WEB + sep) || rel.includes('\0')) return send(res, 403, 'text/plain', 'nope');
  try {
    const body = await readFile(file);
    send(res, 200, TYPES[extname(file)] ?? 'application/octet-stream', body);
  } catch {
    send(res, 404, 'text/plain', 'not found');
  }
}

/**
 * Server-sent events rather than a websocket: the data only ever flows one way,
 * and EventSource reconnects on its own when this process restarts.
 */
async function stream(res, produce) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  let alive = true;
  res.on('close', () => { alive = false; });

  while (alive) {
    const started = Date.now();
    const seen = changeVersion();
    const payload = await produce();
    if (!alive) break;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    // Sleep until an agent writes (watch.mjs), then let the burst settle.
    await nextChange(seen);
    const gap = MIN_GAP_MS - (Date.now() - started);
    await new Promise((r) => setTimeout(r, Math.max(250, gap)));
  }
}

createServer(async (req, res) => {
  // Refuse before doing any work: wrong host (DNS rebinding), another site's page,
  // or anything but a read.
  if (!allowedHost(req.headers.host, PORT)) return send(res, 421, 'text/plain', 'wrong host');
  if (!allowedOrigin({ origin: req.headers.origin, fetchSite: req.headers['sec-fetch-site'] }, PORT)) {
    return send(res, 403, 'text/plain', 'cross-site request refused');
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'text/plain', 'read-only');

  const path = req.url.split('?')[0];
  if (path === '/api/sessions') {
    return send(res, 200, 'application/json', JSON.stringify(await sessionsView()));
  }
  if (path === '/api/stream') return stream(res, sessionsView);
  if (path === '/api/world') {
    return send(res, 200, 'application/json', JSON.stringify(await buildWorld()));
  }
  if (path === '/api/world/stream') return stream(res, buildWorld);
  if (path === '/api/replay') {
    const q = new URL(req.url, 'http://x').searchParams;
    try {
      const body = await buildReplay({ from: Number(q.get('from')), to: Number(q.get('to')) });
      return send(res, 200, 'application/json', JSON.stringify(body));
    } catch (err) {
      return send(res, 400, 'text/plain; charset=utf-8', String(err.message ?? err));
    }
  }
  // Plain text for the SwiftBar plugin (integrations/swiftbar); same privacy rules as the city.
  if (path === '/api/swiftbar') return send(res, 200, 'text/plain; charset=utf-8', swiftbarText(await buildWorld(), { port: PORT }));
  return serveStatic(path, res);
}).listen(PORT, HOST, () => {
  console.log(`⚔  Kafra is ready at http://${HOST}:${PORT}`);
  console.log(`   reading (read-only): ${PROJECTS_DIR}, ${CODEX_DIR}, ${GEMINI_DIR}, ${CURSOR_DIR}, ${OPENCODE_DIR}, and Aider logs in your repos`);
  // Aider's logs sit in each repo and aren't watched; the 10 s heartbeat picks them up.
  const watched = startWatching([PROJECTS_DIR, CODEX_DIR, GEMINI_DIR, CURSOR_DIR, OPENCODE_DIR]);
  console.log(watched ? '   updates: as soon as an agent writes' : '   updates: every 2 s (folders can\'t be watched here)');
  const config = loadConfig();
  if (config.error) console.log(`   ⚠ ${config.error}`);
  if (config.hide.length || config.only.length || config.redact.length) console.log(`   privacy: ${CONFIG_PATH}`);
  if (config.public) console.log('   PUBLIC MODE: all text, paths and repo names are hidden');
});

// Ctrl+C and launchd's stop: save EXP earned since the last periodic save.
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { saveExp(); process.exit(0); });
