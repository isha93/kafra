/**
 * Replay: the city as it was at any moment of a day.
 *
 * /api/replay sends towns plus one event timeline per agent. Each frame asks
 * "what was every agent doing at time t" and hands a world snapshot, shaped
 * exactly like a live one, to the normal renderer. So everything the live
 * city does (walking, hammering, rain, fireworks on commits, the chat log)
 * happens in the replay too.
 */

import { t } from './i18n.js';

/** The live rules (src/sources/common.mjs decideState), applied at time t. */
function decide({ pending, latest, turnEnded, afterPrompt, ageMs }) {
  if (pending && ageMs < 10 * 60_000) return { kind: pending.kind, tool: pending };
  if (ageMs < 90_000) {
    if (turnEnded) return { kind: 'waiting' };
    if (latest && !afterPrompt) return { kind: latest.kind, tool: latest };
    return { kind: 'cast' };
  }
  if (ageMs < 30 * 60_000) return { kind: turnEnded ? 'waiting' : 'idle' };
  return { kind: 'resting' };
}
const statusOfKind = (k) => (k === 'resting' ? 'resting' : k === 'idle' || k === 'waiting' ? 'idle' : 'active');

/** Index of the last event at or before t, by binary search; -1 if none. */
function lastAt(events, t) {
  let lo = 0, hi = events.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** One agent at time t, or null before its first event. */
export function agentAt(meta, events, t) {
  const idx = lastAt(events, t);
  if (idx < 0) return null;
  let lastTool = null, lastPrompt = null, lastEnd = null, hp = null;
  const tools = [];
  const results = new Map();
  for (let i = idx; i >= 0; i--) {
    const e = events[i];
    if (e.type === 'result') { if (!results.has(e.id)) results.set(e.id, e.error); continue; }
    if (e.type === 'hp') { hp ??= e.hp; continue; }
    if (e.type === 'prompt') { lastPrompt ??= e; continue; }
    if (e.type === 'end') { lastEnd ??= e; continue; }
    if (e.type === 'tool' && tools.length < 12) {
      const done = results.has(e.id);
      tools.push({ ...e, at: new Date(e.t).toISOString(), done, error: results.get(e.id) === true });
      lastTool ??= tools.at(-1);
    }
    if (tools.length >= 12 && lastPrompt && lastEnd && hp != null) break;
  }
  const newest = events[idx];
  const turnEnded = Boolean(lastEnd && lastEnd.t >= (lastTool?.t ?? 0) && lastEnd.t >= (lastPrompt?.t ?? 0));
  const afterPrompt = Boolean(lastPrompt && lastPrompt.t > (lastTool?.t ?? 0) && !turnEnded);
  const pending = lastTool && !lastTool.done && !turnEnded && lastTool.t >= (lastPrompt?.t ?? 0) ? lastTool : null;
  const state = decide({ pending, latest: lastTool, turnEnded, afterPrompt, ageMs: t - newest.t });
  const tool = state.tool ?? null;
  return {
    ...meta,
    kind: state.kind,
    status: statusOfKind(state.kind),
    tool,
    tools,
    hp: hp ?? meta.hp ?? 100,
    building: tool?.kind === 'build' ? tool.building : null,
    file: tool?.file ?? null,
    quest: lastPrompt?.text ?? meta.quest ?? '',
    preview: lastEnd?.text ?? '',
    lastSeen: new Date(newest.t).toISOString(),
    ageMs: t - newest.t,
    touched: [...new Set(tools.filter((x) => x.building).map((x) => x.building))],
  };
}

/** The whole world at time t, in the shape of a live /api/world snapshot. */
export function worldAt(data, t) {
  const towns = data.towns.map((town) => {
    const agents = town.agents
      .map((a) => agentAt(a, data.timelines[a.id] ?? [], t))
      .filter(Boolean);
    return {
      ...town,
      agents,
      commits: town.commits.filter((c) => c.at <= t),
      active: agents.filter((a) => a.status === 'active').length,
      lastSeenMs: 0,
    };
  });
  return { towns: towns.filter((tw) => tw.agents.length || tw.commits.length), scannedAt: new Date(t).toISOString(), public: data.public, replay: true };
}

/* ── The replay bar ─────────────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const clock = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const dayStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
const isoDay = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

/**
 * Replay controller. `onFrame(snapshot)` renders a frame; `onExit()` returns
 * to live; `onLoad(data)` lets the newspaper read the day.
 */
export const replay = {
  active: false,
  playing: false,
  speed: 60,
  t: 0,
  data: null,
  lastFrame: 0,

  bind({ onFrame, onExit, onLoad, onNews }) {
    Object.assign(this, { onFrame, onExit, onLoad, onNews });
    $('rb-play').onclick = () => this.toggle();
    $('rb-speed').onchange = (e) => { this.speed = Number(e.target.value); };
    $('rb-day').onchange = (e) => this.open(new Date(`${e.target.value}T00:00:00`).getTime());
    $('rb-slider').oninput = (e) => this.seek(this.data.from + (Number(e.target.value) / 1000) * (this.data.to - this.data.from));
    $('rb-live').onclick = () => this.close();
    $('rb-news').onclick = () => this.onNews?.(this.data);
    $('rb-day').max = isoDay(Date.now());
  },

  /** Open a day (local midnight to midnight, or to now for today). */
  async open(dayMs = dayStart(Date.now())) {
    const from = dayStart(dayMs);
    const to = Math.min(from + 86_400_000, Date.now());
    $('replaybar').hidden = false;
    $('rb-time').textContent = t('rb.loading');
    $('rb-day').value = isoDay(from);
    let data;
    try {
      const res = await fetch(`/api/replay?from=${from}&to=${to}`);
      if (!res.ok) throw new Error(await res.text());
      data = await res.json();
    } catch (err) {
      $('rb-time').textContent = t('rb.failed', { e: err.message });
      return;
    }
    this.data = data;
    this.active = true;
    document.body.classList.add('replaying');
    this.marks();
    this.onLoad?.(data);
    // Start at the first thing that happened, not at an empty midnight.
    const first = Math.min(...Object.values(data.timelines).map((ev) => ev[0]?.t ?? Infinity), to);
    this.seek(Math.max(from, first - 60_000));
  },

  close() {
    this.active = false;
    this.playing = false;
    $('replaybar').hidden = true;
    $('rb-play').textContent = '▶';
    document.body.classList.remove('replaying');
    this.onExit?.();
  },

  toggle() {
    if (!this.active) return;
    this.playing = !this.playing;
    $('rb-play').textContent = this.playing ? '⏸' : '▶';
  },

  seek(t) {
    if (!this.data) return;
    this.t = Math.max(this.data.from, Math.min(this.data.to, t));
    this.paint(true);
  },

  /** Advance with the game clock; called every animation frame. */
  tick(dt) {
    if (!this.active || !this.playing) return;
    this.t += dt * 1000 * this.speed;
    if (this.t >= this.data.to) { this.t = this.data.to; this.toggle(); }
    this.paint(false);
  },

  /** Re-render at most ~6 times a second; walking between frames is the renderer's job. */
  paint(force) {
    const now = performance.now();
    $('rb-time').textContent = clock(this.t);
    $('rb-slider').value = String(Math.round(((this.t - this.data.from) / (this.data.to - this.data.from)) * 1000));
    if (!force && now - this.lastFrame < 160) return;
    this.lastFrame = now;
    this.onFrame?.(worldAt(this.data, this.t));
  },

  /** Ticks over the slider: gold for commits, red for failed tools. */
  marks() {
    const { from, to } = this.data;
    const pos = (t) => `${(((t - from) / (to - from)) * 100).toFixed(2)}%`;
    const ticks = [];
    for (const town of this.data.towns) for (const c of town.commits) ticks.push(`<i class="mk commit" style="left:${pos(c.at)}" title="${clock(c.at)} ${t('rb.commit')}"></i>`);
    for (const events of Object.values(this.data.timelines)) {
      for (const e of events) if (e.type === 'result' && e.error) ticks.push(`<i class="mk error" style="left:${pos(e.t)}" title="${clock(e.t)} ${t('rb.fail')}"></i>`);
    }
    $('rb-marks').innerHTML = ticks.join('');
  },

  /** Wall-clock stand-in for durations and log timestamps while replaying. */
  now() { return this.active ? this.t : Date.now(); },
};
