/**
 * Cursor's agent (the CLI and the Agents window) as an agent source.
 *
 * Each conversation is a JSONL transcript at
 * ~/.cursor/projects/<encoded cwd>/agent-transcripts/<id>/<id>.jsonl, with
 * subagents in a `subagents/` folder beside it. Lines are Anthropic-shaped,
 * { role, message: { content: [blocks] } }, with text, tool_use and
 * tool_result blocks; tool names are Cursor's (Shell, Read, StrReplace…).
 *
 * The format is undocumented and has changed between releases: lines carry no
 * timestamps (the file's mtime stands in), and some versions leave tool
 * results out, in which case finished tools are assumed. Chats in the IDE's
 * side panel live in its internal database and aren't read.
 */
import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { similarTool, redact } from '../activity.mjs';
import { tailLines, headLine, decideState, statusOfKind } from './common.mjs';
import { jobFor } from './classes.mjs';

export const CURSOR_DIR = process.env.KAFRA_CURSOR_DIR ?? join(homedir(), '.cursor', 'projects');

const RECENT_TOOLS = 12;
const firstLine = (s) => redact(String(s ?? '').replace(/\s+/g, ' ').trim());
const blocksOf = (rec) => (Array.isArray(rec.message?.content) ? rec.message.content : typeof rec.message?.content === 'string' ? [{ type: 'text', text: rec.message.content }] : []);
/** Cursor wraps what you typed in <user_query> tags, after injected context. */
const userText = (text) => String(text).match(/<user_query>([\s\S]*?)<\/user_query>/)?.[1] ?? String(text);

/**
 * The project folder's name is the cwd with "/" turned into "-", which is
 * ambiguous when folder names have dashes; walk the disk to find the real one.
 */
const decoded = new Map();
export function decodeProjectDir(name) {
  if (decoded.has(name)) return decoded.get(name);
  const parts = name.split('-').filter(Boolean);
  const find = (base, rest) => {
    if (!rest.length) return base;
    for (let k = rest.length; k >= 1; k--) {
      const next = join(base, rest.slice(0, k).join('-'));
      if (existsSync(next)) {
        const found = find(next, rest.slice(k));
        if (found) return found;
      }
    }
    return null;
  };
  const path = find('/', parts);
  decoded.set(name, path);
  return path;
}

/** A transcript's injected context names its workspace; prefer that to decoding. */
async function workspaceOf(path) {
  try {
    const m = (await headLine(path, 256 * 1024)).match(/Workspace Path: (\/[^\n"\\<]+)/);
    return m?.[1]?.trim() ?? null;
  } catch { return null; }
}

async function readTranscript(path, st, projectDir) {
  const lines = await tailLines(path, st.size);
  const tools = [];
  const results = new Map();
  let quest = '', preview = '', newest = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch { continue; }
    const blocks = blocksOf(rec);
    for (const b of blocks) if (b.type === 'tool_result') results.set(b.tool_use_id, b.is_error === true);
    const hasResult = blocks.some((b) => b.type === 'tool_result');
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
    if (rec.role === 'user' && !hasResult && text) {
      newest ??= 'prompt';
      quest ||= firstLine(userText(text));
    }
    if (rec.role === 'assistant') {
      const uses = blocks.filter((b) => b.type === 'tool_use');
      newest ??= uses.length ? 'tool' : 'ended';
      if (text) preview ||= firstLine(text);
      for (const b of uses.reverse()) {
        if (tools.length >= RECENT_TOOLS) break;
        tools.push({ id: b.id ?? `${st.size}:${i}:${tools.length}`, name: b.name, ...similarTool(b.name, b.input ?? {}), at: st.mtime.toISOString() });
      }
    }
  }
  // Without any tool results in the file, this Cursor doesn't write them: assume finished.
  for (const t of tools) {
    t.done = results.size ? results.has(t.id) : true;
    t.error = results.get(t.id) === true;
  }

  const cwd = (await workspaceOf(path)) ?? decodeProjectDir(projectDir);
  if (!cwd) return null;
  const ageMs = Date.now() - st.mtime.getTime();
  const latest = tools[0] ?? null;
  const pending = latest && !latest.done && newest === 'tool' ? latest : null;
  const state = decideState({ pending, latest, turnEnded: newest === 'ended', afterPrompt: newest === 'prompt', ageMs });
  return {
    source: 'cursor',
    id: `cursor:${basename(path, '.jsonl')}`,
    cwd,
    map: cwd.split('/').filter(Boolean).pop() ?? '?',
    branch: '',
    model: 'cursor',
    ...jobFor('cursor'),
    // Transcripts don't record token use.
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

/** Transcript files under one project, with the conversation each subagent belongs to. */
async function transcripts(projectPath) {
  const root = join(projectPath, 'agent-transcripts');
  const out = [];
  const walk = async (dir, leader, depth) => {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isFile() && e.name.endsWith('.jsonl')) out.push({ path: p, leader });
      else if (e.isDirectory() && depth < 3) {
        // <id>/<id>.jsonl is a conversation; <id>/subagents/*.jsonl are its party.
        await walk(p, e.name === 'subagents' ? basename(dir) : leader, depth + 1);
      }
    }
  };
  await walk(root, null, 0);
  return out;
}

/** Cursor agent conversations touched in the last `maxAgeDays`. */
export async function listSessions({ maxAgeDays = 7 } = {}) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  let projects;
  try { projects = await readdir(CURSOR_DIR); } catch { return []; }
  const all = [];
  for (const project of projects) {
    for (const { path, leader } of await transcripts(join(CURSOR_DIR, project))) {
      try {
        const st = await stat(path);
        if (st.size === 0 || st.mtime.getTime() < cutoff) continue;
        const s = await readTranscript(path, st, project);
        if (s) all.push({ s, leader: leader ? `cursor:${leader}` : null });
      } catch { /* written or removed mid-scan */ }
    }
  }
  const byId = new Map(all.filter((x) => !x.leader).map((x) => [x.s.id, x.s]));
  const out = [];
  for (const { s, leader } of all) {
    const parent = leader && byId.get(leader);
    if (parent) parent.party.push({ ...s, isParty: true, agentType: 'subagent' });
    else out.push(s);
  }
  return out;
}

/** Transcripts carry no timestamps, so there is nothing to place on a replay's clock. */
export async function replaySessions() {
  return [];
}
