/**
 * The one status everything agrees on: what the person watching should feel
 * about an agent right now. Rings, badges, the party bar and alerts all read
 * this, so a waiting agent is yellow everywhere at once.
 */

export const STATUS = {
  waiting: { color: 0xffc400, css: '#ffc400', label: 'nunggu kamu', rank: 0 },
  error: { color: 0xe5483a, css: '#e5483a', label: 'error', rank: 1 },
  working: { color: 0x5cc030, css: '#5cc030', label: 'kerja', rank: 2 },
  idle: { color: 0x8a8a8a, css: '#8a8a8a', label: 'idle', rank: 3 },
};

export function statusOf(a) {
  // A subagent that finished hands its result to its leader, not to you.
  if (a.kind === 'waiting' || a.kind === 'ask') return a.isParty ? 'idle' : 'waiting';
  if (a.status === 'active' && a.tools?.[0]?.error) return 'error';
  if (a.status === 'active') return 'working';
  return 'idle';
}

/** When the current state started: the running tool's start, else the last transcript write. */
export function since(a) {
  if (a.status === 'active' && a.tool?.at) return Date.parse(a.tool.at);
  return Date.parse(a.lastSeen);
}

/** Clock-style elapsed time, `0:29`, `2:05`, `1:03:07`; unambiguous in any language. */
export function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

/** A pending tool running longer than this is worth a look. */
export const LONG_RUN_MS = 2 * 60_000;
/** Context left, in percent, below which an agent is about to compact. */
export const LOW_HP = 15;
