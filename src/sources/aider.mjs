/**
 * Aider as an agent source.
 *
 * Aider writes a Markdown log, .aider.chat.history.md, at the root of the repo
 * it runs in. A session starts with `# aider chat started at <time>`; what
 * you type is `#### …`; Aider's own messages are blockquotes, among them
 *
 *   > Applied edit to <file>        a file written     → build
 *   > Running <command>             a shell command    → by the command
 *   > Commit <hash> <message>       a commit           → deliver
 *   > Added <file> to the chat.     a file read in     → research
 *
 * and everything else is the model's reply. Lines have no timestamps (the
 * file's mtime stands in), so there's no replay. The logs are found in repos
 * other agents work in, and in folders up to three levels below your home.
 */
import { open, readdir, stat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { kindOfCommand, oneLine, redact } from '../activity.mjs';
import { TAIL_BYTES, decideState, statusOfKind } from './common.mjs';
import { jobFor } from './classes.mjs';

export const HISTORY = '.aider.chat.history.md';
const RECENT_TOOLS = 12;
const RESCAN_MS = 10 * 60_000;
const SKIP = new Set(['node_modules', 'Library', 'Applications', 'Pictures', 'Music', 'Movies', 'vendor', 'dist', 'build']);
const firstLine = (s) => redact(String(s ?? '').replace(/\s+/g, ' ').trim());

/** The tail of a file as lines with their byte offsets, which never change as Aider appends. */
async function tailWithOffsets(path, size) {
  const start = Math.max(0, size - TAIL_BYTES);
  const fh = await open(path, 'r');
  try {
    const { buffer } = await fh.read({ buffer: Buffer.alloc(Math.min(TAIL_BYTES, size)), position: start });
    const out = [];
    let at = 0;
    for (const line of buffer.toString('utf8').split('\n')) {
      out.push({ line, offset: start + at });
      at += Buffer.byteLength(line) + 1;
    }
    if (start > 0) out.shift();
    return out;
  } finally {
    await fh.close();
  }
}

/** One blockquote line → a tool, or null. */
export function aiderTool(text, root) {
  const file = (f) => (isAbsolute(f) ? f : join(root, f));
  let m;
  if ((m = text.match(/^Applied edit to (.+)$/))) return { name: 'edit', kind: 'build', file: file(m[1].trim()) };
  if ((m = text.match(/^Running (.+)$/))) return { name: 'run', kind: kindOfCommand(m[1]), label: oneLine(m[1]) };
  if ((m = text.match(/^Commit ([0-9a-f]{7,}) (.*)$/))) return { name: 'commit', kind: 'deliver', label: oneLine(m[2]) };
  if ((m = text.match(/^Added (.+?) to the chat/))) return { name: 'add', kind: 'research', file: file(m[1].trim()) };
  return null;
}

/** The current session of one history file. */
export async function readHistory(path, st, root) {
  const lines = await tailWithOffsets(path, st.size);
  // Only the newest session: from the last "chat started" header on.
  let from = 0;
  for (let i = lines.length - 1; i >= 0; i--) if (lines[i].line.startsWith('# aider chat started at')) { from = i; break; }
  const started = lines[from]?.line.match(/started at (.+)$/)?.[1] ?? '';

  const tools = [];
  let quest = '', preview = '', newest = null, model = '';
  for (let i = lines.length - 1; i >= from; i--) {
    const { line, offset } = lines[i];
    if (!line.trim()) continue;
    if (line.startsWith('#### ')) {
      newest ??= 'prompt';
      quest ||= firstLine(line.slice(5));
    } else if (line.startsWith('> ')) {
      const text = line.slice(2).trim();
      model ||= text.match(/^(?:Main )?[Mm]odel: (\S+)/)?.[1] ?? '';
      const t = aiderTool(text, root);
      if (t && tools.length < RECENT_TOOLS) {
        newest ??= 'tool';
        tools.push({ id: `${offset}`, ...t, at: st.mtime.toISOString(), done: true, error: false });
      }
    } else if (!line.startsWith('#')) {
      newest ??= 'ended';
      preview ||= firstLine(line);
    }
  }

  const ageMs = Date.now() - st.mtime.getTime();
  const state = decideState({ pending: null, latest: tools[0] ?? null, turnEnded: newest === 'ended', afterPrompt: newest === 'prompt', ageMs });
  return {
    source: 'aider',
    id: `aider:${root}:${started}`,
    cwd: root,
    map: root.split('/').filter(Boolean).pop() ?? '?',
    branch: '',
    model: model || 'aider',
    ...jobFor('aider', model),
    // The log doesn't record token use.
    hp: 100,
    tokens: 0,
    contextWindow: 0,
    kind: state.kind,
    status: statusOfKind(state.kind),
    tool: state.tool ?? null,
    tools,
    title: quest.slice(0, 80),
    quest: quest.slice(0, 200),
    preview: preview.slice(0, 140),
    lastSeen: st.mtime.toISOString(),
    ageMs,
    isParty: false,
    party: [],
  };
}

/**
 * Folders under home that hold a history file. The walk runs in the
 * background at most every RESCAN_MS, so it never holds up a scan of the world.
 */
let found = { at: 0, dirs: [] };
let walking = null;
function homeDirs() {
  if (!walking && Date.now() - found.at > RESCAN_MS) walking = scanHome().finally(() => { walking = null; });
  return found.dirs;
}

/** Walk home now; resolves to the folders found. */
export async function scanHome() {
  const dirs = [];
  const walk = async (dir, depth) => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.isFile() && e.name === HISTORY)) dirs.push(dir);
    if (depth >= 3) return;
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && !SKIP.has(e.name)) await walk(join(dir, e.name), depth + 1);
    }
  };
  await walk(process.env.KAFRA_AIDER_ROOT ?? homedir(), 0);
  found = { at: Date.now(), dirs };
  return dirs;
}

/** Aider sessions touched in the last `maxAgeDays`, in known repos and under home. */
export async function listSessions({ maxAgeDays = 7, knownCwds = [] } = {}) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const out = [];
  for (const root of new Set([...knownCwds, ...homeDirs()])) {
    const path = join(root, HISTORY);
    try {
      const st = await stat(path);
      if (st.size === 0 || st.mtime.getTime() < cutoff) continue;
      out.push(await readHistory(path, st, root));
    } catch { /* no history here */ }
  }
  return out;
}

/** Lines have no timestamps, so there is nothing to place on a replay's clock. */
export async function replaySessions() {
  return [];
}
