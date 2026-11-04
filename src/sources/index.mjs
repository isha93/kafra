/**
 * Every agent source, merged into one list of sessions: Claude Code, Codex,
 * Gemini CLI, Cursor's agent, OpenCode and Aider.
 *
 * Adding an agent means one file in this folder that returns sessions in the
 * shared shape (see codex.mjs for a compact example) and one line here.
 * Nothing downstream — world, privacy, menu bar, the city — knows which tool
 * a session came from, beyond its `source` and job class.
 *
 * KAFRA_SOURCES=claude-code,codex limits which sources are read, and
 * KAFRA_MAX_AGE_DAYS (default 7) how far back.
 */
import * as claudeCode from './claude-code.mjs';
import * as codex from './codex.mjs';
import * as gemini from './gemini.mjs';
import * as cursor from './cursor.mjs';
import * as opencode from './opencode.mjs';
import * as aider from './aider.mjs';
import { SOURCE_NAME } from './classes.mjs';

const enabled = (name) => !process.env.KAFRA_SOURCES || process.env.KAFRA_SOURCES.split(',').includes(name);

/** How far back sessions count; KAFRA_MAX_AGE_DAYS widens it (older ones rest at the inn). */
const DEFAULT_DAYS = Number(process.env.KAFRA_MAX_AGE_DAYS) || 7;

export async function listSessions({ maxAgeDays = DEFAULT_DAYS } = {}) {
  const [claude, codexSessions, cursorSessions, opencodeSessions] = await Promise.all([
    enabled('claude-code') ? claudeCode.listSessions({ maxAgeDays }) : { sessions: [] },
    enabled('codex') ? codex.listSessions({ maxAgeDays }).catch(() => []) : [],
    enabled('cursor') ? cursor.listSessions({ maxAgeDays }).catch(() => []) : [],
    enabled('opencode') ? opencode.listSessions({ maxAgeDays }).catch(() => []) : [],
  ]);
  const first = [...(claude.sessions ?? []), ...codexSessions, ...cursorSessions, ...opencodeSessions];
  // Gemini and Aider find their logs by folder, so they're told where the others work.
  const known = first.map((s) => s.cwd);
  const [geminiSessions, aiderSessions] = await Promise.all([
    enabled('gemini') ? gemini.listSessions({ maxAgeDays, knownCwds: known }).catch(() => []) : [],
    enabled('aider') ? aider.listSessions({ maxAgeDays, knownCwds: known }).catch(() => []) : [],
  ]);

  const merged = [...first, ...geminiSessions, ...aiderSessions]
    .map((s) => ({ ...s, sourceName: SOURCE_NAME[s.source] ?? s.source }));
  merged.sort((a, b) => a.ageMs - b.ageMs);
  // One sprite per id: two records with the same id would take turns
  // overwriting each other every poll and flood the chat log. Freshest wins.
  const ids = new Set();
  const sessions = merged.filter((s) => !ids.has(s.id) && ids.add(s.id));

  // A missing ~/.claude is only an error when no other agent has anything either.
  const error = sessions.length ? undefined : claude.error;
  return { sessions, error, scannedAt: new Date().toISOString() };
}

/** Every source's sessions with activity in [from, to], each with its events. */
export async function replaySessions({ from, to }) {
  const [claude, codexSessions, opencodeSessions] = await Promise.all([
    enabled('claude-code') ? claudeCode.replaySessions({ from, to }) : [],
    enabled('codex') ? codex.replaySessions({ from, to }).catch(() => []) : [],
    enabled('opencode') ? opencode.replaySessions({ from, to }).catch(() => []) : [],
  ]);
  const known = [...claude, ...codexSessions].map((s) => s.cwd);
  const geminiSessions = enabled('gemini') ? await gemini.replaySessions({ from, to, knownCwds: known }).catch(() => []) : [];
  const ids = new Set();
  // Cursor and Aider logs have no timestamps per line, so they sit replays out.
  return [...claude, ...codexSessions, ...opencodeSessions, ...geminiSessions]
    .map((s) => ({ ...s, sourceName: SOURCE_NAME[s.source] ?? s.source }))
    .filter((s) => !ids.has(s.id) && ids.add(s.id));
}
