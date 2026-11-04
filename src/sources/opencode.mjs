/**
 * OpenCode as an agent source.
 *
 * OpenCode keeps every session in one SQLite database,
 * ~/.local/share/opencode/opencode.db (OPENCODE_DB moves it):
 *
 *   session_v2       id, directory, title, parent_id (subagents), model
 *                    { id, providerID }, time_updated (ms)
 *   session_message  per session by seq: `user` prompts, `assistant` steps
 *                    (with token usage), and an `idle` marker when a turn ends
 *   session_part     assistant content; `tool` parts are
 *                    { id, name, state: { status, input }, time: { created } }
 *                    with status streaming | running | completed | error
 *
 * Read with node:sqlite (Node 22.13+), opened read-only. Older OpenCode
 * releases kept JSON files instead; those, and older Node, are skipped.
 */
import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { similarTool, redact } from '../activity.mjs';
import { openSqlite, decideState, statusOfKind, hpOf } from './common.mjs';
import { jobFor } from './classes.mjs';

export const OPENCODE_DB = process.env.KAFRA_OPENCODE_DB ?? process.env.OPENCODE_DB
  ?? join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'opencode', 'opencode.db');
export const OPENCODE_DIR = dirname(OPENCODE_DB);

const CONTEXT_WINDOW = 200_000;
const RECENT_TOOLS = 12;
const json = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : s ?? {}; } catch { return {}; } };
const firstLine = (s) => redact(String(s ?? '').replace(/\s+/g, ' ').trim());

/** Run `fn` with the database open, or return `fallback` if it can't be opened. */
async function withDb(fn, fallback) {
  try { await stat(OPENCODE_DB); } catch { return fallback; }
  let db;
  try {
    db = await openSqlite(OPENCODE_DB);
    return db ? fn(db) : fallback;
  } catch {
    return fallback; // an older schema, or locked mid-migration
  } finally {
    db?.close();
  }
}

/** A tool part → the shared tool shape. */
function toolOf(part) {
  const d = json(part.data);
  const status = d.state?.status;
  return {
    id: d.id ?? part.call_id,
    name: d.name,
    ...similarTool(d.name, json(d.state?.input)),
    at: new Date(d.time?.created ?? part.time_created).toISOString(),
    done: status === 'completed' || status === 'error',
    error: status === 'error',
  };
}

/** Prompt text from a user message. */
const promptOf = (m) => firstLine(json(m.data).text);

function readSession(db, s) {
  const tools = db.prepare(`SELECT data, call_id, time_created FROM session_part
    WHERE session_id = ? AND type = 'tool' ORDER BY time_created DESC LIMIT ${RECENT_TOOLS}`).all(s.id).map(toolOf);
  const messages = db.prepare(`SELECT type, data FROM session_message
    WHERE session_id = ? AND type IN ('user', 'assistant', 'idle') ORDER BY seq DESC LIMIT 40`).all(s.id);
  const newest = messages[0]?.type;
  const quest = promptOf(messages.find((m) => m.type === 'user') ?? {});
  const tokens = json(messages.find((m) => m.type === 'assistant')?.data).tokens ?? {};
  const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0);
  const text = db.prepare(`SELECT data FROM session_part WHERE session_id = ? AND type = 'text'
    ORDER BY time_created DESC LIMIT 1`).get(s.id);

  const ageMs = Date.now() - s.time_updated;
  const latest = tools[0] ?? null;
  const pending = latest && !latest.done && newest === 'assistant' ? latest : null;
  const state = decideState({ pending, latest, turnEnded: newest === 'idle', afterPrompt: newest === 'user', ageMs });
  const model = json(s.model).id ?? 'opencode';
  const cwd = String(s.directory);
  return {
    source: 'opencode',
    id: `opencode:${s.id}`,
    cwd,
    map: cwd.split('/').filter(Boolean).pop() ?? '?',
    branch: '',
    model,
    ...jobFor('opencode', model),
    hp: hpOf(used, CONTEXT_WINDOW),
    tokens: used,
    contextWindow: CONTEXT_WINDOW,
    kind: state.kind,
    status: statusOfKind(state.kind),
    tool: state.tool ?? null,
    tools,
    title: (firstLine(s.title) || quest).slice(0, 80),
    quest: quest.slice(0, 200),
    preview: firstLine(json(text?.data).text).slice(0, 140),
    lastSeen: new Date(s.time_updated).toISOString(),
    ageMs,
    isParty: false,
    party: [],
    parentId: s.parent_id ? `opencode:${s.parent_id}` : null,
  };
}

/** Sessions touched in the last `maxAgeDays`; subagent sessions ride with their parent. */
export async function listSessions({ maxAgeDays = 7 } = {}) {
  const since = Date.now() - maxAgeDays * 86_400_000;
  return withDb((db) => {
    const rows = db.prepare(`SELECT id, directory, title, parent_id, model, time_updated FROM session_v2
      WHERE time_updated >= ? AND time_archived IS NULL ORDER BY time_updated DESC LIMIT 200`).all(since);
    const sessions = rows.map((s) => readSession(db, s));
    const byId = new Map(sessions.map((s) => [s.id, s]));
    const out = [];
    for (const s of sessions) {
      const parent = s.parentId && byId.get(s.parentId);
      if (parent) parent.party.push({ ...s, isParty: true, agentType: 'subagent' });
      else out.push(s);
    }
    return out;
  }, []);
}

/** Sessions with anything in [from, to], each as a timeline of events. */
export async function replaySessions({ from, to }) {
  return withDb((db) => {
    const rows = db.prepare(`SELECT id, directory, title, parent_id, model FROM session_v2
      WHERE time_updated >= ? AND time_created <= ?`).all(from, to);
    return rows.map((s) => {
      const events = [];
      for (const m of db.prepare(`SELECT type, data, time_created FROM session_message
        WHERE session_id = ? AND time_created BETWEEN ? AND ? AND type IN ('user', 'idle')`).all(s.id, from, to)) {
        if (m.type === 'user') events.push({ t: m.time_created, type: 'prompt', text: promptOf(m).slice(0, 200) });
        else events.push({ t: m.time_created, type: 'end', text: '' });
      }
      for (const p of db.prepare(`SELECT data, call_id, time_created FROM session_part
        WHERE session_id = ? AND type = 'tool' AND time_created BETWEEN ? AND ?`).all(s.id, from, to)) {
        const tool = toolOf(p);
        const d = json(p.data);
        events.push({ t: p.time_created, type: 'tool', id: tool.id, name: tool.name, kind: tool.kind, file: tool.file, label: tool.label });
        if (tool.done) events.push({ t: d.time?.completed ?? p.time_created, type: 'result', id: tool.id, error: tool.error });
      }
      if (!events.length) return null;
      events.sort((a, b) => a.t - b.t);
      const model = json(s.model).id ?? 'opencode';
      const prompt = events.find((e) => e.type === 'prompt')?.text ?? '';
      return {
        source: 'opencode', id: `opencode:${s.id}`, cwd: String(s.directory), branch: '', model, ...jobFor('opencode', model),
        title: (firstLine(s.title) || prompt).slice(0, 80), isParty: Boolean(s.parent_id),
        leader: s.parent_id ? `opencode:${s.parent_id}` : undefined, agentType: s.parent_id ? 'subagent' : undefined, events,
      };
    }).filter(Boolean);
  }, []);
}
