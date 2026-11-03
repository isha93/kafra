import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSessions, PROJECTS_DIR } from './sources/claude-code.mjs';
import { buildWorld } from './world.mjs';

const PORT = Number(process.env.KAFRA_PORT ?? 4317);

/**
 * Loopback only, never 0.0.0.0.
 *
 * This server hands out the contents of your Claude Code transcripts — working
 * directories, branch names, the text of what you and the model said. Binding to
 * every interface would publish all of that to anyone on the same WiFi.
 */
const HOST = '127.0.0.1';

const WEB = join(fileURLToPath(new URL('../web/', import.meta.url)));

/** Third-party code the page may load, by explicit path only — node_modules is never browsable. */
const VENDOR = {
  '/vendor/pixi.mjs': fileURLToPath(new URL('../node_modules/pixi.js/dist/pixi.min.mjs', import.meta.url)),
};
const POLL_MS = 2000;

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
  res.writeHead(code, { 'content-type': type });
  res.end(body);
}

async function serveStatic(req, res) {
  const path = req.url.split('?')[0];
  const rel = normalize(path === '/' ? 'index.html' : path.slice(1));
  // normalize() collapses "..", but a path that still starts with one escapes WEB.
  if (rel.startsWith('..')) return send(res, 403, 'text/plain', 'nope');
  try {
    const body = await readFile(join(WEB, rel));
    send(res, 200, TYPES[extname(rel)] ?? 'application/octet-stream', body);
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
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  let alive = true;
  res.on('close', () => { alive = false; });

  while (alive) {
    const payload = await produce();
    if (!alive) break;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/api/sessions') {
    return send(res, 200, 'application/json', JSON.stringify(await listSessions()));
  }
  if (path === '/api/stream') return stream(res, listSessions);
  if (path === '/api/world') {
    return send(res, 200, 'application/json', JSON.stringify(await buildWorld()));
  }
  if (path === '/api/world/stream') return stream(res, buildWorld);
  if (VENDOR[path]) {
    return readFile(VENDOR[path]).then(
      (body) => send(res, 200, TYPES['.mjs'], body),
      () => send(res, 404, 'text/plain', 'jalankan npm install dulu'),
    );
  }
  return serveStatic(req, res);
}).listen(PORT, HOST, () => {
  console.log(`⚔  Kafra siap di http://${HOST}:${PORT}`);
  console.log(`   membaca ${PROJECTS_DIR} (read-only)`);
});
