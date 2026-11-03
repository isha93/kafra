/**
 * OpenAI Codex CLI (and Codex Desktop) as an agent source.
 *
 * Sessions live at ~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl.
 * Each line is { timestamp, type, payload }:
 *
 *   session_meta    first line: id, cwd, git, cli version
 *   turn_context    per turn: cwd, model
 *   response_item   function_call (exec_command, shell_command, …),
 *                   custom_tool_call (apply_patch), web_search_call,
 *                   and their *_output records, keyed by call_id
 *   event_msg       task_started / task_complete / turn_aborted,
 *                   user_message, agent_message, token_count
 */
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { kindOfCommand, oneLine, redact } from '../activity.mjs';
import { tailLines, headLine, backwardLines, decideState, statusOfKind, hpOf } from './common.mjs';
import { jobFor } from './classes.mjs';

export const CODEX_DIR = process.env.KAFRA_CODEX_DIR ?? join(homedir(), '.codex', 'sessions');

const DEFAULT_WINDOW = 258_400;
const RECENT_TOOLS = 12;

function parseArgs(s) {
  try { return typeof s === 'string' ? JSON.parse(s) : s ?? {}; } catch { return {}; }
}

/** Codex tool call → { kind, file?, label? }. */
export function codexTool(name, args = {}, input = '') {
  switch (name) {
    case 'exec_command':
    case 'shell_command':
    case 'shell': {
      const cmd = args.cmd ?? args.command ?? '';
      return { kind: kindOfCommand(cmd), label: oneLine(Array.isArray(cmd) ? cmd.at(-1) : cmd) };
    }
    case 'apply_patch': {
      const file = String(input).match(/\*\*\* (?:Update|Add|Delete) File: (.+)/)?.[1]?.trim();
      return { kind: 'build', file, label: file ? undefined : 'patch' };
    }
    case 'view_image':
      return { kind: 'research', file: args.path };
    case 'update_plan':
      return { kind: 'cast', label: 'menyusun rencana' };
    case 'write_stdin':
      return { kind: 'craft', label: 'menulis ke proses' };
    default:
      return { kind: 'craft', label: oneLine(name.replace(/^mcp__[^_]+__/, '')) };
  }
}

/** A tool's output says it failed: a non-zero exit code, or a failed call. */
export function codexFailed(output) {
  const s = typeof output === 'string' ? output : JSON.stringify(output ?? '');
  const exit = s.match(/Process exited with code (\d+)/);
  if (exit) return exit[1] !== '0';
  return /exec_command failed|verification failed|^error:/i.test(s);
}

async function readRollout(path, st) {
  const lines = await tailLines(path, st.size);
  let cwd = null, model = null, window = null, used = 0, gotTokens = false;
  let preview = '', quest = '';
  let newestTurn = null;   // 'ended' | 'prompt' | 'tool', whichever came last
  const tools = [];
  const outputs = new Map(); // call_id → failed?

  for (let i = lines.length - 1; i >= 0; i--) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch { continue; }
    const p = rec.payload ?? {};
    const at = rec.timestamp;

    if (rec.type === 'turn_context') {
      cwd ??= p.cwd;
      model ??= p.model;
    } else if (rec.type === 'event_msg') {
      if (p.type === 'token_count' && p.info && !gotTokens) {
        gotTokens = true;
        used = p.info.last_token_usage?.input_tokens ?? 0;
        window ??= p.info.model_context_window ?? null;
      } else if (p.type === 'task_started') {
        window ??= p.model_context_window ?? null;
        newestTurn ??= 'prompt';
      } else if (p.type === 'task_complete' || p.type === 'turn_aborted') {
        newestTurn ??= 'ended';
        if (!preview && p.last_agent_message) preview = p.last_agent_message;
      } else if (p.type === 'user_message') {
        newestTurn ??= 'prompt';
        quest ||= p.message ?? '';
      } else if (p.type === 'agent_message') {
        preview ||= p.message ?? '';
      }
    } else if (rec.type === 'response_item') {
      if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
        outputs.set(p.call_id, codexFailed(p.output));
      } else if ((p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'web_search_call') && tools.length < RECENT_TOOLS) {
        newestTurn ??= 'tool';
        const t = p.type === 'web_search_call'
          ? { kind: 'teleport', label: oneLine(p.action?.query ?? p.action?.url ?? 'web') }
          : codexTool(p.name, parseArgs(p.arguments), p.input);
        tools.push({
          id: p.call_id ?? `${at}:${tools.length}`,
          name: p.type === 'web_search_call' ? 'web_search' : p.name,
          ...t,
          at,
          // Web searches have no output record; their status says they're done.
          done: p.type === 'web_search_call' ? p.status === 'completed' : undefined,
        });
      }
    }
  }

  for (const t of tools) {
    if (t.done === undefined) t.done = outputs.has(t.id);
    t.error = outputs.get(t.id) === true;
    if (t.file) t.file = String(t.file);
  }

  // Metadata from the first line, when the tail had no turn_context.
  let branch = '', id = path.match(/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/)?.[1] ?? path;
  try {
    const meta = JSON.parse(await headLine(path, 512 * 1024));
    if (meta.type === 'session_meta') {
      cwd ??= meta.payload?.cwd;
      branch = meta.payload?.git?.branch ?? '';
      id = meta.payload?.id ?? id;
    }
  } catch { /* first line too long or still being written: the tail is enough */ }
  if (!cwd) return null;

  const ageMs = Date.now() - st.mtime.getTime();
  const latest = tools[0] ?? null;
  const pending = latest && !latest.done && newestTurn === 'tool' ? latest : null;
  const state = decideState({ pending, latest, turnEnded: newestTurn === 'ended', afterPrompt: newestTurn === 'prompt', ageMs });
  const w = window ?? DEFAULT_WINDOW;
  const firstLine = (s) => redact(String(s).replace(/\s+/g, ' ').trim());

  return {
    source: 'codex',
    id: `codex:${id}`,
    cwd,
    map: cwd.split('/').filter(Boolean).pop() ?? '?',
    branch: redact(branch),
    model: model ?? 'codex',
    ...jobFor('codex', model ?? ''),
    hp: hpOf(used, w),
    tokens: used,
    contextWindow: w,
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

async function walk(dir, depth = 0) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const out = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 3) out.push(...await walk(p, depth + 1));
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/** Codex sessions touched in the last `maxAgeDays`. */
export async function listSessions({ maxAgeDays = 7 } = {}) {
  const cutoff = Date.now() - maxAgeDays * 86_400_000;
  const out = [];
  for (const path of await walk(CODEX_DIR)) {
    try {
      const st = await stat(path);
      if (st.size === 0 || st.mtime.getTime() < cutoff) continue;
      const s = await readRollout(path, st);
      if (s) out.push(s);
    } catch { /* a session being written can vanish mid-scan */ }
  }
  return out;
}

/* ── Replay ─────────────────────────────────────────────────────────────── */

async function timelineOf(path, st, from, to) {
  const events = [];
  let cwd = null, model = null, window = DEFAULT_WINDOW, prompt = '';
  for await (const line of backwardLines(path, st.size)) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const t = Date.parse(rec.timestamp);
    if (!t || t > to) continue;
    if (t < from) break;
    const p = rec.payload ?? {};
    if (rec.type === 'turn_context') { cwd ??= p.cwd; model ??= p.model; }
    if (rec.type === 'event_msg') {
      if (p.type === 'token_count' && p.info?.last_token_usage) events.push({ t, type: 'hp', hp: hpOf(p.info.last_token_usage.input_tokens ?? 0, p.info.model_context_window ?? window) });
      if (p.type === 'task_started' && p.model_context_window) window = p.model_context_window;
      if (p.type === 'task_complete' || p.type === 'turn_aborted') events.push({ t, type: 'end', text: redact(String(p.last_agent_message ?? '').replace(/\s+/g, ' ').slice(0, 140)) });
      if (p.type === 'user_message') {
        prompt = redact(String(p.message ?? '').replace(/\s+/g, ' ').slice(0, 200));
        events.push({ t, type: 'prompt', text: prompt });
      }
    } else if (rec.type === 'response_item') {
      if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
        events.push({ t, type: 'result', id: p.call_id, error: codexFailed(p.output) });
      } else if (p.type === 'function_call' || p.type === 'custom_tool_call') {
        events.push({ t, type: 'tool', id: p.call_id, name: p.name, ...codexTool(p.name, parseArgs(p.arguments), p.input) });
      } else if (p.type === 'web_search_call') {
        const id = `${t}:web`;
        events.push({ t, type: 'result', id, error: false });
        events.push({ t, type: 'tool', id, name: 'web_search', kind: 'teleport', label: oneLine(p.action?.query ?? 'web') });
      }
    }
  }
  if (!events.length) return null;
  let branch = '', id = path.match(/([0-9a-f]{8}-[0-9a-f-]{27,})\.jsonl$/)?.[1] ?? path;
  try {
    const meta = JSON.parse(await headLine(path, 512 * 1024));
    if (meta.type === 'session_meta') { cwd ??= meta.payload?.cwd; branch = meta.payload?.git?.branch ?? ''; id = meta.payload?.id ?? id; }
  } catch { /* the tail had what we need */ }
  if (!cwd) return null;
  events.reverse();
  return { source: 'codex', id: `codex:${id}`, cwd, branch: redact(branch), model: model ?? 'codex', ...jobFor('codex', model ?? ''), title: prompt.slice(0, 80), isParty: false, events };
}

/** Codex sessions with anything in [from, to]. */
export async function replaySessions({ from, to }) {
  const out = [];
  for (const path of await walk(CODEX_DIR)) {
    try {
      const st = await stat(path);
      if (st.mtime.getTime() < from) continue;
      const s = await timelineOf(path, st, from, to);
      if (s) out.push(s);
    } catch { /* vanished */ }
  }
  return out;
}
