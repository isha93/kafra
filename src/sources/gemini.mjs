/**
 * Google Gemini CLI as an agent source.
 *
 * Sessions live at ~/.gemini/tmp/<project hash>/chats/session-*.json, one JSON
 * document each: { sessionId, startTime, lastUpdated, messages[] }. Messages
 * are `user`, `gemini` (with toolCalls, tokens, model) or `info`/`error`.
 *
 * The folder is sha256(working directory) and the file never names the
 * directory, so it is recovered by hashing directories Kafra already knows
 * (other agents' working directories and their parents) plus a shallow scan
 * of the usual project folders. Sessions whose folder can't be found are
 * skipped rather than guessed.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { kindOfCommand, oneLine, redact } from '../activity.mjs';
import { decideState, statusOfKind, hpOf } from './common.mjs';
import { jobFor } from './classes.mjs';

export const GEMINI_DIR = process.env.KAFRA_GEMINI_DIR ?? join(homedir(), '.gemini', 'tmp');

const WINDOW = 1_048_576;
const RECENT_TOOLS = 12;
const MAX_FILE = 50 * 1024 * 1024; // a session this large is history, not state

export const projectHash = (dir) => createHash('sha256').update(dir).digest('hex');

/** Gemini CLI tool → { kind, file?, label? }. */
export function geminiTool(name, args = {}) {
  switch (name) {
    case 'run_shell_command':
      return { kind: kindOfCommand(args.command), label: oneLine(args.description || args.command) };
    case 'write_file':
    case 'replace':
    case 'edit':
      return { kind: 'build', file: args.file_path ?? args.absolute_path };
    case 'read_file':
      return { kind: 'research', file: args.absolute_path ?? args.file_path };
    case 'read_many_files':
    case 'glob':
    case 'search_file_content':
    case 'list_directory':
      return { kind: 'research', label: oneLine(args.pattern ?? args.path ?? name) };
    case 'google_web_search':
    case 'web_fetch':
      return { kind: 'teleport', label: oneLine(args.query ?? args.prompt ?? args.url) };
    default:
      return { kind: 'craft', label: oneLine(name) };
  }
}

/* ── Finding the working directory behind a hash ──────────────────────── */

const SKIP = new Set(['node_modules', 'Library', 'Applications', 'Pictures', 'Music', 'Movies', '.Trash', 'Pods', 'build', 'dist', 'DerivedData']);
let scanned = { at: 0, map: new Map() };

async function scanDirs(root, depth, out) {
  if (depth < 0) return;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = join(root, e.name);
    out.push(p);
    await scanDirs(p, depth - 1, out);
  }
}

/**
 * hash → directory, for every directory worth checking. Known working
 * directories and their ancestors are always included; the home scan is
 * cached for five minutes.
 */
async function hashMap(known) {
  if (Date.now() - scanned.at > 5 * 60_000) {
    const dirs = [homedir()];
    await scanDirs(homedir(), 3, dirs);
    scanned = { at: Date.now(), map: new Map(dirs.map((d) => [projectHash(d), d])) };
  }
  const map = new Map(scanned.map);
  for (let d of known) {
    while (d && d !== '/' && !map.has(projectHash(d))) {
      map.set(projectHash(d), d);
      d = dirname(d);
    }
  }
  return map;
}

/* ── Sessions ──────────────────────────────────────────────────────────── */

function readSession(doc, cwd, st) {
  const messages = (doc.messages ?? []).filter((m) => m.type === 'user' || m.type === 'gemini');
  const tools = [];
  let quest = '', preview = '', model = null, used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === 'user') { quest ||= typeof m.content === 'string' ? m.content : ''; continue; }
    model ??= m.model ?? null;
    if (!used && m.tokens) used = m.tokens.input ?? 0;
    if (!preview && typeof m.content === 'string' && m.content.trim()) preview = m.content;
    for (const c of [...(m.toolCalls ?? [])].reverse()) {
      if (tools.length >= RECENT_TOOLS) break;
      const status = String(c.status ?? '');
      tools.push({
        id: c.id ?? `${m.id}:${tools.length}`,
        name: c.name,
        ...geminiTool(c.name, c.args ?? {}),
        at: c.timestamp ?? m.timestamp,
        done: ['success', 'error', 'cancelled'].includes(status),
        error: status === 'error',
        // Waiting on your approval is the agent asking you something.
        ...(status === 'awaiting_approval' ? { kind: 'ask' } : {}),
      });
    }
  }

  const last = messages.at(-1);
  const lastHasTools = Boolean(last?.toolCalls?.length);
  const ageMs = Date.now() - st.mtime.getTime();
  const latest = tools[0] ?? null;
  const pending = latest && !latest.done && last?.type === 'gemini' && lastHasTools ? latest : null;
  const state = decideState({
    pending,
    latest,
    // A reply with no tool calls hands the turn back to you.
    turnEnded: last?.type === 'gemini' && !lastHasTools,
    afterPrompt: last?.type === 'user',
    ageMs,
  });
  const firstLine = (s) => redact(String(s).replace(/\s+/g, ' ').trim());

  return {
    source: 'gemini',
    id: `gemini:${doc.sessionId}`,
    cwd,
    map: cwd.split('/').filter(Boolean).pop() ?? '?',
    branch: '',
    model: model ?? 'gemini',
    ...jobFor('gemini', model ?? ''),
    hp: hpOf(used, WINDOW),
    tokens: used,
    contextWindow: WINDOW,
    kind: state.kind,
    status: statusOfKind(state.kind),
    tool: state.tool ?? null,
    tools,
    title: firstLine(quest).slice(0, 80),
    quest: firstLine(quest).slice(0, 200),
    preview: firstLine(preview).slice(0, 140),
    lastSeen: st.mtime.toISOString(),
    ageMs,
    sizeBytes: st.size,
    isParty: false,
    party: [],
  };
}

/**
 * Gemini sessions touched in the last `maxAgeDays`. `knownCwds` are other
 * agents' working directories, the best hints for resolving project hashes.
 */
export async function listSessions({ maxAgeDays = 7, knownCwds = [] } = {}) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  let projects;
  try { projects = await readdir(GEMINI_DIR); } catch { return []; }

  const recent = [];
  for (const hash of projects) {
    const chats = join(GEMINI_DIR, hash, 'chats');
    let files;
    try { files = await readdir(chats); } catch { continue; }
    for (const f of files.filter((n) => n.startsWith('session-') && n.endsWith('.json'))) {
      try {
        const st = await stat(join(chats, f));
        if (st.mtime.getTime() >= cutoff && st.size <= MAX_FILE) recent.push({ hash, path: join(chats, f), st });
      } catch { /* vanished */ }
    }
  }
  if (!recent.length) return [];

  const dirs = await hashMap(knownCwds);
  // A resumed session is saved again under a new file with the same sessionId;
  // only the newest file speaks for it.
  recent.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  const seen = new Set();
  const out = [];
  for (const { hash, path, st } of recent) {
    const cwd = dirs.get(hash);
    if (!cwd) continue;
    try {
      const doc = JSON.parse(await readFile(path, 'utf8'));
      if (seen.has(doc.sessionId)) continue;
      seen.add(doc.sessionId);
      out.push(readSession(doc, cwd, st));
    } catch { /* mid-write */ }
  }
  return out;
}

/* ── Replay ─────────────────────────────────────────────────────────────── */

/** Gemini sessions with anything in [from, to]. */
export async function replaySessions({ from, to, knownCwds = [] }) {
  let projects;
  try { projects = await readdir(GEMINI_DIR); } catch { return []; }
  const files = [];
  for (const hash of projects) {
    const chats = join(GEMINI_DIR, hash, 'chats');
    let names;
    try { names = await readdir(chats); } catch { continue; }
    for (const f of names.filter((n) => n.startsWith('session-') && n.endsWith('.json'))) {
      try {
        const st = await stat(join(chats, f));
        if (st.mtime.getTime() >= from && st.size <= MAX_FILE) files.push({ hash, path: join(chats, f), st });
      } catch { /* vanished */ }
    }
  }
  if (!files.length) return [];
  const dirs = await hashMap(knownCwds);
  files.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  const seen = new Set();
  const out = [];
  for (const { hash, path } of files) {
    const cwd = dirs.get(hash);
    if (!cwd) continue;
    let doc;
    try { doc = JSON.parse(await readFile(path, 'utf8')); } catch { continue; }
    if (seen.has(doc.sessionId)) continue;
    seen.add(doc.sessionId);
    const events = [];
    let model = null, title = '';
    for (const m of doc.messages ?? []) {
      const t = Date.parse(m.timestamp);
      if (!t || t < from || t > to) continue;
      const text = (s) => redact(String(s ?? '').replace(/\s+/g, ' ').slice(0, 200));
      if (m.type === 'user') { title ||= text(m.content); events.push({ t, type: 'prompt', text: text(m.content) }); continue; }
      if (m.type !== 'gemini') continue;
      model ??= m.model ?? null;
      if (m.tokens) events.push({ t, type: 'hp', hp: hpOf(m.tokens.input ?? 0, WINDOW) });
      for (const c of m.toolCalls ?? []) {
        const ct = Date.parse(c.timestamp) || t;
        const id = c.id ?? `${m.id}:${c.name}`;
        events.push({ t: ct, type: 'tool', id, name: c.name, ...geminiTool(c.name, c.args ?? {}) });
        if (['success', 'error', 'cancelled'].includes(c.status)) events.push({ t: ct + 1, type: 'result', id, error: c.status === 'error' });
      }
      if (!m.toolCalls?.length) events.push({ t, type: 'end', text: text(m.content).slice(0, 140) });
    }
    if (!events.length) continue;
    events.sort((a, b) => a.t - b.t);
    out.push({ source: 'gemini', id: `gemini:${doc.sessionId}`, cwd, branch: '', model: model ?? 'gemini', ...jobFor('gemini', model ?? ''), title: title.slice(0, 80), isParty: false, events });
  }
  return out;
}
