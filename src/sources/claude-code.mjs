import { readdir, stat, open, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { kindOfClaudeTool, targetOfClaudeTool, redact } from '../activity.mjs';

/**
 * Claude Code as an agent source.
 *
 * Every source returns the same agent shape (see readSession's return value), so
 * the world builder never needs to know which tool produced a session.
 */

/** Overridable so tests and demos can point at fixture transcripts instead of real ones. */
export const PROJECTS_DIR = process.env.KAFRA_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects');

/** Transcripts reach 144 MB. Only the tail carries current state. */
const TAIL_BYTES = 256 * 1024;

/**
 * Context window used to turn token counts into an HP bar.
 *
 * Measured, not assumed: real sessions on this machine reach 818k tokens, so a
 * 200k window reads 0% for everything and tells you nothing. Override per model
 * with KAFRA_CONTEXT_WINDOW when that stops being true.
 */
const CONTEXT_WINDOW = Number(process.env.KAFRA_CONTEXT_WINDOW ?? 1_000_000);

/** Subagents only show up while they are recent; finished ones would crowd the town. */
const PARTY_MAX_AGE_MS = 20 * 60_000;
/** A subagent that has handed back its answer lingers this long, then leaves. */
const PARTY_DONE_LINGER_MS = 30_000;

/** How many recent tool calls each agent carries, for the activity log. */
const RECENT_TOOLS = 12;

/** Job class per model. Cosmetic, but it makes a list of UUIDs readable at a glance. */
function jobClass(model = '') {
  if (model.includes('opus')) return { job: 'Lord Knight', sprite: 'knight' };
  if (model.includes('sonnet')) return { job: 'Assassin Cross', sprite: 'assassin' };
  if (model.includes('haiku')) return { job: 'Hunter', sprite: 'hunter' };
  if (model.includes('fable')) return { job: 'Bard', sprite: 'bard' };
  return { job: 'Novice', sprite: 'novice' };
}

/**
 * Read the last TAIL_BYTES of a file as lines.
 *
 * The first line is dropped: a byte-offset read almost always lands mid-line,
 * and a half-written JSON object is worse than one missing record.
 */
async function tailLines(path, size) {
  const start = Math.max(0, size - TAIL_BYTES);
  const fh = await open(path, 'r');
  try {
    const { buffer } = await fh.read({
      buffer: Buffer.alloc(Math.min(TAIL_BYTES, size)),
      position: start,
    });
    const lines = buffer.toString('utf8').split('\n');
    if (start > 0) lines.shift();
    return lines.filter(Boolean);
  } finally {
    await fh.close();
  }
}

/** Plain text out of a content block array, for the one-line activity preview. */
function previewOf(message) {
  const content = message?.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  for (const block of content) {
    if (block?.type === 'text' && block.text?.trim()) return block.text.trim();
    if (block?.type === 'tool_use') return `⚒ ${block.name}`;
  }
  return '';
}

function blocksOf(rec) {
  const c = rec.message?.content;
  return Array.isArray(c) ? c : [];
}

/** A user record that is a real prompt, not a tool result or injected context. */
function isHumanPrompt(rec) {
  if (rec.type !== 'user' || rec.isMeta) return false;
  const c = rec.message?.content;
  if (typeof c === 'string') return !c.startsWith('<');
  return blocksOf(rec).some((b) => b.type === 'text') && !blocksOf(rec).some((b) => b.type === 'tool_result');
}

/**
 * Decide what the agent is doing right now from the shape of the transcript tail.
 *
 * mtime alone is wrong for long tool calls: a 5-minute build writes nothing to the
 * transcript while it runs, so a pending tool_use counts as active for longer.
 *
 * Most tools finish in milliseconds, so between calls the agent keeps the kind of
 * its latest tool. Otherwise an agent editing ten files would read as "thinking"
 * almost all the time and never be seen at the building it is working on.
 */
function currentState({ lastTurn, pending, latest, ageMs }) {
  if (pending && ageMs < 10 * 60_000) return { kind: pending.kind, tool: pending };
  if (ageMs < 90_000) {
    if (!lastTurn) return { kind: 'cast' };
    // An assistant turn with no tool call is the model handing control back.
    if (lastTurn.type === 'assistant' && !blocksOf(lastTurn).some((b) => b.type === 'tool_use')) {
      return { kind: 'waiting' };
    }
    if (latest && !isHumanPrompt(lastTurn)) return { kind: latest.kind, tool: latest };
    return { kind: 'cast' };
  }
  if (ageMs < 30 * 60_000) {
    if (lastTurn?.type === 'assistant' && !blocksOf(lastTurn).some((b) => b.type === 'tool_use')) {
      return { kind: 'waiting' };
    }
    return { kind: 'idle' };
  }
  return { kind: 'resting' };
}

function statusOf(kind) {
  if (kind === 'resting') return 'resting';
  if (kind === 'idle' || kind === 'waiting') return 'idle';
  return 'active';
}

async function readTranscript(path, { size, mtime }) {
  const lines = await tailLines(path, size);
  let last = null;        // newest assistant turn, for model + usage
  let lastTurn = null;    // newest user or assistant record, for state
  let preview = '';
  let title = '';
  let lastPrompt = '';
  let meta = {};
  const tools = [];
  const resolved = new Map(); // tool_use_id → is_error

  for (let i = lines.length - 1; i >= 0; i--) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch { continue; }

    if (rec.cwd && !meta.cwd) {
      meta = {
        cwd: rec.cwd,
        gitBranch: rec.gitBranch || '',
        sessionId: rec.sessionId,
        isSidechain: Boolean(rec.isSidechain),
        version: rec.version,
      };
    }
    if (!title && rec.type === 'ai-title' && rec.aiTitle) title = rec.aiTitle;
    if (!lastPrompt && rec.type === 'last-prompt' && rec.lastPrompt) lastPrompt = rec.lastPrompt;
    if (!last && rec.type === 'assistant' && rec.message?.usage) last = rec;
    if (rec.type !== 'assistant' && rec.type !== 'user') continue;
    if (!lastTurn && !rec.isMeta) lastTurn = rec;
    if (!preview) preview = previewOf(rec.message);
    if (!lastPrompt && isHumanPrompt(rec)) lastPrompt = previewOf(rec.message);

    for (const b of blocksOf(rec)) {
      if (b.type === 'tool_result') resolved.set(b.tool_use_id, Boolean(b.is_error));
      if (b.type === 'tool_use' && tools.length < RECENT_TOOLS) {
        tools.push({
          id: b.id,
          name: b.name,
          kind: kindOfClaudeTool(b.name, b.input ?? {}),
          ...targetOfClaudeTool(b.name, b.input ?? {}),
          at: rec.timestamp,
        });
      }
    }
  }

  for (const t of tools) {
    t.done = resolved.has(t.id);
    t.error = resolved.get(t.id) === true;
  }
  // Only the newest turn can be in flight; an older unresolved call was interrupted.
  const pending = tools.find((t) => !t.done && t.at === tools[0]?.at) ?? null;
  const ageMs = Date.now() - mtime.getTime();
  const state = currentState({ lastTurn, pending, latest: tools[0], ageMs });

  const usage = last?.message?.usage ?? {};
  const used =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0);
  const model = last?.message?.model ?? 'unknown';

  return {
    meta,
    agent: {
      source: 'claude-code',
      model,
      ...jobClass(model),
      hp: Math.max(0, Math.min(100, Math.round((1 - used / CONTEXT_WINDOW) * 100))),
      tokens: used,
      contextWindow: CONTEXT_WINDOW,
      kind: state.kind,
      status: statusOf(state.kind),
      tool: state.tool ?? null,
      tools,
      title: redact(title),
      quest: redact(lastPrompt.replace(/\s+/g, ' ').slice(0, 200)),
      preview: redact(preview.replace(/\s+/g, ' ').slice(0, 140)),
      lastSeen: mtime.toISOString(),
      ageMs,
      sizeBytes: size,
    },
  };
}

async function readParty(dir, sessionId, cwd) {
  const subDir = join(PROJECTS_DIR, dir, sessionId, 'subagents');
  let files;
  try { files = await readdir(subDir); } catch { return []; }

  const out = [];
  for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
    try {
      const path = join(subDir, file);
      const st = await stat(path);
      if (st.size === 0 || Date.now() - st.mtime.getTime() > PARTY_MAX_AGE_MS) continue;
      const { meta, agent } = await readTranscript(path, st);
      if (agent.kind === 'waiting' && agent.ageMs > PARTY_DONE_LINGER_MS) continue;
      let info = {};
      try { info = JSON.parse(await readFile(path.replace(/\.jsonl$/, '.meta.json'), 'utf8')); } catch {}
      out.push({
        ...agent,
        id: `${sessionId}/${file.replace('.jsonl', '')}`,
        cwd: meta.cwd || cwd,
        branch: meta.gitBranch,
        isParty: true,
        title: redact(info.description ?? agent.title),
        agentType: info.agentType ?? 'subagent',
      });
    } catch { /* subagent finished and was cleaned up mid-scan */ }
  }
  return out;
}

async function readSession(dir, file) {
  const path = join(PROJECTS_DIR, dir, file);
  const st = await stat(path);
  if (st.size === 0) return null;

  const { meta, agent } = await readTranscript(path, st);
  if (!meta.cwd) return null;

  const id = meta.sessionId ?? file.replace('.jsonl', '');
  return {
    ...agent,
    id,
    map: meta.cwd.split('/').filter(Boolean).pop() ?? '?',
    cwd: meta.cwd,
    branch: meta.gitBranch,
    isParty: meta.isSidechain,
    party: await readParty(dir, id, meta.cwd),
  };
}

/** Every session on this machine, freshest first. */
export async function listSessions({ maxAgeDays = 7 } = {}) {
  let dirs;
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return { error: `Tidak bisa membaca ${PROJECTS_DIR}`, sessions: [] };
  }

  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const out = [];

  for (const dir of dirs) {
    let files;
    try { files = await readdir(join(PROJECTS_DIR, dir)); } catch { continue; }
    for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
      try {
        const { mtime } = await stat(join(PROJECTS_DIR, dir, file));
        if (mtime.getTime() < cutoff) continue;
        const session = await readSession(dir, file);
        if (session) out.push(session);
      } catch { /* a session being written to can vanish mid-scan */ }
    }
  }

  out.sort((a, b) => a.ageMs - b.ageMs);
  return { sessions: out, scannedAt: new Date().toISOString() };
}
