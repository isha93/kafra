import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSessions, PROJECTS_DIR } from './sources/claude-code.mjs';
import { buildWorld } from './world.mjs';
import { allowedHost, allowedOrigin, SECURITY_HEADERS } from './guard.mjs';
import { loadConfig, visible, publicSessions, CONFIG_PATH } from './privacy.mjs';
import { swiftbarText } from './menubar.mjs';

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

const pixiFile = (rel) => fileURLToPath(new URL(`../node_modules/pixi.js/dist/${rel}`, import.meta.url));

/**
 * Third-party code the page may load, by explicit path only — node_modules is
 * never browsable.
 *
 * PixiJS compiles shader helpers with `new Function` unless its unsafe-eval
 * package (misleadingly named: it *removes* the need for eval) is installed.
 * That package only exists as a classic script that patches the global PIXI,
 * so the page loads both as classic scripts and the city's modules import
 * from a generated shim. The CSP can then refuse eval outright.
 */
const VENDOR = {
  '/vendor/pixi.js': pixiFile('pixi.min.js'),
  '/vendor/pixi-csp.js': pixiFile('packages/unsafe-eval.min.js'),
};

/** `export const { Application, … } = globalThis.PIXI`, with every name the ESM build exports. */
async function pixiShim() {
  const esm = await readFile(pixiFile('pixi.min.mjs'), 'utf8');
  const block = esm.match(/export\s*\{([^}]*)\}\s*;?\s*(\/\/.*)?\s*$/)?.[1] ?? '';
  const names = block.split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  return `const P = globalThis.PIXI;\nif (!P) throw new Error('PixiJS did not load');\nexport const { ${names.join(', ')} } = P;\n`;
}
let shim = null;
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
    const payload = await produce();
    if (!alive) break;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    await new Promise((r) => setTimeout(r, POLL_MS));
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
  // Plain text for the SwiftBar plugin (integrations/swiftbar); same privacy rules as the city.
  if (path === '/api/swiftbar') return send(res, 200, 'text/plain; charset=utf-8', swiftbarText(await buildWorld(), { port: PORT }));
  if (path === '/vendor/pixi.mjs') {
    shim ??= pixiShim().catch(() => null);
    const body = await shim;
    return body ? send(res, 200, TYPES['.mjs'], body) : send(res, 404, 'text/plain', 'jalankan npm install dulu');
  }
  if (VENDOR[path]) {
    return readFile(VENDOR[path]).then(
      (body) => send(res, 200, TYPES['.js'], body),
      () => send(res, 404, 'text/plain', 'jalankan npm install dulu'),
    );
  }
  return serveStatic(path, res);
}).listen(PORT, HOST, () => {
  console.log(`⚔  Kafra siap di http://${HOST}:${PORT}`);
  console.log(`   membaca ${PROJECTS_DIR} (read-only)`);
  const config = loadConfig();
  if (config.error) console.log(`   ⚠ ${config.error}`);
  if (config.hide.length || config.only.length || config.redact.length) console.log(`   privasi: ${CONFIG_PATH}`);
  if (config.public) console.log('   MODE PUBLIK: semua teks, path, dan nama repo disembunyikan');
});
