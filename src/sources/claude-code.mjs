import { readdir, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { kindOfClaudeTool, targetOfClaudeTool, redact } from '../activity.mjs';
import { tailLines, backwardLines } from './common.mjs';
import { jobFor } from './classes.mjs';

/**
 * Claude Code as an agent source.
 *
 * Every source returns the same agent shape (see readSession's return value), so
 * the world builder never needs to know which tool produced a session.
 */

/** Overridable so tests and demos can point at fixture transcripts instead of real ones. */
export const PROJECTS_DIR = process.env.KAFRA_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects');

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

/**
 * An assistant record that hands the turn back to you. `stop_reason: end_turn`
 * says so outright; text with `stop_reason: tool_use` is narration before the
 * next tool, not a question. Older transcripts without stop_reason fall back
 * to "no tool call in this record".
 */
export function turnEnded(rec) {
  if (rec?.type !== 'assistant') return false;
  const reason = rec.message?.stop_reason;
  if (reason) return reason === 'end_turn';
  return !blocksOf(rec).some((b) => b.type === 'tool_use');
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
    if (turnEnded(lastTurn)) return { kind: 'waiting' };
    if (latest && !isHumanPrompt(lastTurn)) return { kind: latest.kind, tool: latest };
    return { kind: 'cast' };
  }
  if (ageMs < 30 * 60_000) {
    if (turnEnded(lastTurn)) return { kind: 'waiting' };
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
      ...jobFor('claude-code', model),
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
        branch: redact(meta.gitBranch),
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
    branch: redact(meta.gitBranch),
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
    return { error: `Can't read ${PROJECTS_DIR}`, sessions: [] };
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

/* ── Replay ─────────────────────────────────────────────────────────────── */

/**
 * Everything one transcript did between `from` and `to`, oldest first, read
 * backwards from the end so a replay of today never reads last month.
 */
async function timelineOf(path, st, from, to) {
  const events = [];
  let meta = null, model = null, title = '', prompt = '';
  for await (const line of backwardLines(path, st.size)) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.type === 'ai-title' && !title) title = rec.aiTitle ?? '';
    const t = Date.parse(rec.timestamp);
    if (!t || t > to) continue;
    if (t < from) break;
    if (rec.cwd && !meta) meta = { cwd: rec.cwd, branch: rec.gitBranch || '', sessionId: rec.sessionId, isSidechain: Boolean(rec.isSidechain) };

    if (rec.type === 'assistant') {
      model ??= rec.message?.model ?? null;
      const u = rec.message?.usage;
      if (u) events.push({ t, type: 'hp', hp: Math.max(0, Math.min(100, Math.round((1 - ((u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)) / CONTEXT_WINDOW) * 100))) });
      for (const b of blocksOf(rec)) {
        if (b.type !== 'tool_use') continue;
        events.push({ t, type: 'tool', id: b.id, name: b.name, kind: kindOfClaudeTool(b.name, b.input ?? {}), ...targetOfClaudeTool(b.name, b.input ?? {}) });
      }
      if (turnEnded(rec)) events.push({ t, type: 'end', text: redact(previewOf(rec.message).replace(/\s+/g, ' ').slice(0, 140)) });
    } else if (rec.type === 'user') {
      for (const b of blocksOf(rec)) if (b.type === 'tool_result') events.push({ t, type: 'result', id: b.tool_use_id, error: Boolean(b.is_error) });
      if (isHumanPrompt(rec)) {
        const text = redact(previewOf(rec.message).replace(/\s+/g, ' ').slice(0, 200));
        prompt = text;
        events.push({ t, type: 'prompt', text });
      }
    }
  }
  if (!meta || !events.length) return null;
  events.reverse();
  return { meta, model: model ?? 'unknown', title: redact(title) || prompt, events };
}

/** Claude Code sessions and subagents with anything in [from, to]. */
export async function replaySessions({ from, to }) {
  let dirs;
  try { dirs = await readdir(PROJECTS_DIR); } catch { return []; }
  const out = [];
  for (const dir of dirs) {
    let files;
    try { files = await readdir(join(PROJECTS_DIR, dir)); } catch { continue; }
    for (const file of files.filter((f) => f.endsWith('.jsonl'))) {
      const path = join(PROJECTS_DIR, dir, file);
      try {
        const st = await stat(path);
        if (st.mtime.getTime() < from) continue;
        const tl = await timelineOf(path, st, from, to);
        if (!tl) continue;
        const id = tl.meta.sessionId ?? file.replace('.jsonl', '');
        out.push({ source: 'claude-code', id, cwd: tl.meta.cwd, branch: redact(tl.meta.branch), model: tl.model, ...jobFor('claude-code', tl.model), title: tl.title, isParty: false, events: tl.events });

        // Its subagents, as party members.
        const subDir = join(PROJECTS_DIR, dir, id, 'subagents');
        let subs = [];
        try { subs = await readdir(subDir); } catch { /* none */ }
        for (const sub of subs.filter((f) => f.endsWith('.jsonl'))) {
          const sp = join(subDir, sub);
          const sst = await stat(sp);
          if (sst.mtime.getTime() < from) continue;
          const stl = await timelineOf(sp, sst, from, to);
          if (!stl) continue;
          let info = {};
          try { info = JSON.parse(await readFile(sp.replace(/\.jsonl$/, '.meta.json'), 'utf8')); } catch {}
          out.push({
            source: 'claude-code', id: `${id}/${sub.replace('.jsonl', '')}`, leader: id, cwd: stl.meta.cwd || tl.meta.cwd, branch: '',
            model: stl.model, ...jobFor('claude-code', stl.model), title: redact(info.description ?? stl.title),
            isParty: true, agentType: info.agentType ?? 'subagent', events: stl.events,
          });
        }
      } catch { /* vanished mid-scan */ }
    }
  }
  return out;
}
