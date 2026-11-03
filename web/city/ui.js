/**
 * The HTML windows around the map: world map, Kafra info window, chat log.
 *
 * Plain DOM on purpose: text in panels should be selectable and copyable, which
 * canvas text is not.
 */

import { iconFor, characterSheets } from './assets.js';
import { repoLabel, districtLabel } from './town.js';
import { STATUS, statusOf, since, duration } from './status.js';
import { sfx, setSfx, setMusic } from './audio.js';
import { t, locale, districtName, kingdomName } from './i18n.js';

const $ = (id) => document.getElementById(id);

/** "Now": the wall clock, or the replay's clock while replaying. */
let now = () => Date.now();
/** True while a replay plays: alerts are history then, not news. */
let quiet = () => false;
export function setClock(fn) { now = fn; }
export function setQuiet(fn) { quiet = fn; }

/** Activity icon as HTML: generated art when installed, else the glyph. */
function icon(kind) {
  const art = iconFor(kind);
  return art ? `<img class="ico" src="${art.url}" alt="">` : esc(KIND_ICON[kind] ?? '');
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const kindLabel = (k) => t(`kind.${k}`);
/** A subagent that finished hands back to its leader, not to you: show it as idle. */
const agentKind = (a) => (a.isParty && (a.kind === 'waiting' || a.kind === 'ask') ? 'idle' : a.kind);
const KIND_ICON = {
  build: '⚒', research: '📖', craft: '⚗', trial: '⚔', deliver: '📦', teleport: '✦',
  summon: '✧', ask: '?', cast: '✶', waiting: '!', idle: '·', resting: 'z',
};

/** "5 min ago", in the current language. */
function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return t('ago.s', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('ago.m', { n: m });
  const h = Math.round(m / 60);
  return h < 48 ? t('ago.h', { n: h }) : t('ago.d', { n: Math.round(h / 24) });
}
const num = (n) => Number(n ?? 0).toLocaleString(locale());

function hpBar(hp) {
  const cls = hp <= 20 ? 'low' : hp <= 50 ? 'mid' : '';
  return `<span class="hp ${cls}"><i style="width:${hp}%"></i></span>`;
}

const basename = (p) => String(p ?? '').split('/').filter(Boolean).pop() ?? '';

function toolLine(t) {
  const target = t.file ? basename(t.file) : t.label ?? '';
  const mark = t.error ? '<b class="bad">✗</b>' : t.done ? '<b class="ok">✓</b>' : '<b class="run">…</b>';
  return `<li title="${esc(t.file ?? t.label ?? '')}">${mark} <span class="k">${icon(t.kind)} ${esc(t.name)}</span> ${esc(target)}</li>`;
}

/* ── World map ──────────────────────────────────────────────────────────── */

export function renderTowns(data, selection, pick) {
  const el = $('towns');
  const selTown = selection?.type === 'town' ? selection.id : selection?.town;
  // Grouped by kingdom (GitHub owner), in the order towns arrive: busiest first.
  const kingdoms = new Map();
  for (const town of data.towns) {
    const k = kingdomName(town.owner);
    if (!kingdoms.has(k)) kingdoms.set(k, []);
    kingdoms.get(k).push(town);
  }
  el.innerHTML = [...kingdoms].map(([k, list]) => `<div class="kingdom">${esc(k)}</div>` + list.map((tw) => `
    <button class="town ${tw.id === selTown ? 'sel' : ''}" data-id="${esc(tw.id)}">
      <span class="dot ${tw.active ? 'on' : ''}"></span>
      <span class="tn">${esc(tw.town)} <span class="stars" title="${esc(tw.tier?.name ?? '')}">${'★'.repeat(tw.tier?.stars ?? 1)}</span></span>
      <span class="tr">${esc(tw.name || t('no.repo'))}</span>
      <span class="tc">${tw.agents.length}</span>
    </button>`).join('')).join('') || `<div class="empty">${esc(t('towns.empty'))}</div>`;
  el.onclick = (e) => {
    const b = e.target.closest('.town');
    if (b) pick({ type: 'town', id: b.dataset.id });
  };
  // Say so when the view is filtered: nobody should mistake public mode for "no data".
  $('mode').textContent = data.public ? t('mode.public') : data.configError ? '⚠ config' : '';
  $('mode').title = data.configError ?? (data.public ? t('mode.public.title') : '');
  const active = data.towns.reduce((n, tw) => n + tw.active, 0);
  const total = data.towns.reduce((n, tw) => n + tw.agents.length, 0);
  $('census').textContent = t('census', { active, total, towns: data.towns.length });
}

/* ── Kafra info window ──────────────────────────────────────────────────── */

function findAgent(snapshot, id) {
  for (const town of snapshot.towns) {
    const a = town.agents.find((x) => x.id === id);
    if (a) return { town, agent: a };
  }
  return null;
}

function agentDetail({ town, agent: a }) {
  const party = town.agents.filter((x) => x.leader === a.id);
  const leader = a.leader && town.agents.find((x) => x.id === a.leader);
  const doing = kindLabel(agentKind(a));
  const where = a.file ? `<code>${esc(a.file)}</code>` : a.tool?.label ? esc(a.tool.label) : '';
  return `
    <div class="who">
      <div><b>${esc(a.isParty ? a.agentType : a.job)}</b> <span class="muted">${esc(a.sourceName ?? '')} · ${esc(a.model)}</span></div>
      <div class="muted">${esc(town.town)} · ${esc(town.name)}${a.branch ? ` · ⎇ ${esc(a.branch)}` : ''}</div>
    </div>
    ${a.title ? `<div class="quest"><span class="lbl">${t('lbl.quest')}</span>${esc(a.title)}</div>` : ''}
    <div class="stat"><span class="lbl">${t('lbl.hp')}</span>${hpBar(a.hp)} <span class="muted">${a.hp}% · ${num(a.tokens)} tok</span></div>
    <div class="stat"><span class="lbl">${t('lbl.doing')}</span><span class="kind k-${a.kind}">${icon(a.kind)} ${esc(doing)}</span> ${where}</div>
    <div class="stat"><span class="lbl">${t('lbl.last')}</span><span class="muted">${ago(a.ageMs)}</span></div>
    ${leader ? `<div class="stat"><span class="lbl">${t('lbl.leader')}</span><a href="#" data-agent="${esc(leader.id)}">${esc(leader.job)}</a></div>` : ''}
    ${party.length ? `<div class="sub">${t('sub.party')}</div><ul class="party">${party.map((p) => `
      <li><a href="#" data-agent="${esc(p.id)}">${esc(p.agentType)}</a> — ${esc(p.title)} <span class="muted">(${esc(kindLabel(agentKind(p)))})</span></li>`).join('')}</ul>` : ''}
    ${a.quest ? `<div class="sub">${t('sub.prompt')}</div><p class="say">${esc(a.quest)}</p>` : ''}
    ${a.preview ? `<div class="sub">${t('sub.reply')}</div><p class="say">${esc(a.preview)}</p>` : ''}
    <div class="sub">${t('sub.activity')}</div>
    <ul class="tools">${(a.tools ?? []).map(toolLine).join('') || '<li class="muted">—</li>'}</ul>`;
}

function commitList(commits) {
  if (!commits.length) return `<p class="muted">${t('commits.none')}</p>`;
  return `<ul class="commits">${commits.slice(0, 15).map((c) => `
    <li><code>${esc(c.hash)}</code> ${esc(c.subject)}
      <span class="muted">+${c.added} −${c.removed} · ${ago(now() - c.at)}</span></li>`).join('')}</ul>`;
}

/** What the town needs to reach the next tier, as small progress bars. */
function growthLine(town) {
  const g = town.growth, next = town.tier?.next;
  if (!g) return '';
  if (!next) return `<div class="stat"><span class="lbl">${t('lbl.history')}</span>${t('history', { files: num(g.files), commits: num(g.commitsTotal) })}</div>`;
  const bar = (have, need) => `<span class="hp"><i style="width:${Math.min(100, (have / need) * 100)}%"></i></span>`;
  const ageDays = g.firstCommitAt ? Math.floor((Date.now() - g.firstCommitAt) / 86_400_000) : 0;
  return `
    <div class="sub">${t('sub.next', { tier: esc(next.name) })}</div>
    <div class="stat grow"><span class="lbl">${t('lbl.file')}</span>${bar(g.files, next.files)} <span class="muted">${num(g.files)} / ${num(next.files)}</span></div>
    <div class="stat grow"><span class="lbl">${t('lbl.commit')}</span>${bar(g.commitsTotal, next.commits)} <span class="muted">${g.commitsTotal} / ${next.commits}</span></div>
    ${next.days ? `<div class="stat grow"><span class="lbl">${t('lbl.age')}</span>${bar(ageDays, next.days)} <span class="muted">${ageDays} / ${t('days', { n: next.days })}</span></div>` : ''}`;
}

function townDetail(town) {
  const busy = town.agents.filter((a) => a.status === 'active');
  return `
    <div class="who">
      <div><b>${esc(town.town)}</b></div>
      <div class="muted">${esc(repoLabel(town))}${town.branch ? ` · ⎇ ${esc(town.branch)}` : ''}</div>
    </div>
    <div class="kafra-say">${esc(t('kafra.welcome', { town: town.town }))}</div>
    <div class="stat"><span class="lbl">${t('lbl.tier')}</span><b>${'★'.repeat(town.tier?.stars ?? 1)}${'☆'.repeat(5 - (town.tier?.stars ?? 1))} ${esc(town.tier?.name ?? '')}</b>
      <span class="muted">${esc(t(`mood.${town.mood}`))}</span></div>
    ${growthLine(town)}
    <div class="stat"><span class="lbl">${t('lbl.region')}</span>${esc(t(`biome.${town.biome?.id ?? 'plains'}`))} <span class="muted">(${esc(town.biome?.languages ?? '')})</span></div>
    <div class="stat"><span class="lbl">${t('lbl.folk')}</span>${t('folk', { n: town.agents.length, busy: busy.length })}</div>
    <div class="stat"><span class="lbl">${t('lbl.buildings')}</span>${t('buildings', { files: num(town.totals.files), dirty: town.totals.dirty })}</div>
    <div class="sub">${t('sub.adventurers')}</div>
    <ul class="party">${town.agents.map((a) => `
      <li><a href="#" data-agent="${esc(a.id)}">${esc(a.isParty ? a.agentType : a.job)}</a>
      <span class="kind k-${agentKind(a)}">${icon(agentKind(a))} ${esc(kindLabel(agentKind(a)))}</span>
      <span class="muted">${esc((a.title || '').slice(0, 40))}</span></li>`).join('')}</ul>
    <div class="sub">${t('sub.districts')}</div>
    <ul class="districts">${town.districts.map((d) => `
      <li><a href="#" data-district="${esc(d.name)}">${esc(districtLabel(d.name))}</a>
      <span class="muted">${t('district.files', { n: d.files })}${d.dirty ? ` · 🚧 ${d.dirty}` : ''}${d.churn ? ` · ${t('lines.week', { n: d.churn })}` : ''}</span></li>`).join('')}</ul>
    <div class="sub">${t('sub.buildlog')}</div>
    ${commitList(town.commits)}
    ${town.error ? `<p class="bad">${esc(town.error)}</p>` : ''}`;
}

function districtDetail(town, name) {
  const d = town.districts.find((x) => x.name === name);
  if (!d) return townDetail(town);
  const builders = town.agents.filter((a) => a.building === name && a.kind === 'build');
  const visited = town.agents.filter((a) => a.touched?.includes(name));
  const commits = town.commits.filter((c) => c.districts.includes(name));
  return `
    <div class="who">
      <div><b>${esc(districtLabel(name))}</b></div>
      <div class="muted">${esc(town.town)} · ${esc(town.name)}</div>
    </div>
    <div class="stat"><span class="lbl">${t('lbl.size')}</span>${t('district.files', { n: d.files })}</div>
    <div class="stat"><span class="lbl">${t('lbl.construction')}</span>${d.dirty ? t('construction.n', { n: d.dirty }) : t('none')}</div>
    <div class="stat"><span class="lbl">${t('lbl.week')}</span>${t('week', { c: d.commits, l: d.churn })}</div>
    ${builders.length ? `<div class="sub">${t('sub.builders')}</div><ul class="party">${builders.map((a) => `
      <li><a href="#" data-agent="${esc(a.id)}">${esc(a.job)}</a> <code>${esc(a.file ?? '')}</code></li>`).join('')}</ul>` : ''}
    ${visited.length ? `<div class="sub">${t('sub.visited')}</div><ul class="party">${visited.map((a) => `
      <li><a href="#" data-agent="${esc(a.id)}">${esc(a.isParty ? a.agentType : a.job)}</a> <span class="muted">${esc((a.title || '').slice(0, 40))}</span></li>`).join('')}</ul>` : ''}
    <div class="sub">${t('sub.commits')}</div>
    ${commitList(commits)}`;
}

/** Which activity each civic building hosts. */
const CIVIC_KIND = { library: 'research', workshop: 'craft', inn: 'resting', arena: 'trial', kafra: 'deliver' };

function civicDetail(town, key) {
  if (key === 'kafra') return townDetail(town);
  const here = town.agents.filter((a) => a.kind === CIVIC_KIND[key]);
  return `
    <div class="who"><div><b>${esc(t(`civic.${key}`))}</b></div><div class="muted">${esc(town.town)}</div></div>
    <p class="say">${esc(t(`civic.${key}.text`))}</p>
    <div class="sub">${t('sub.here')}</div>
    <ul class="party">${here.map((a) => `<li><a href="#" data-agent="${esc(a.id)}">${esc(a.isParty ? a.agentType : a.job)}</a>
      ${a.tool?.label ? `<span class="muted">${esc(a.tool.label)}</span>` : ''}</li>`).join('') || `<li class="muted">${t('empty')}</li>`}</ul>`;
}

let pickHandler = () => {};

export function showDetail(sel, snapshot) {
  const el = $('detail');
  const head = $('detail-title');
  let html = `<p class="muted">${t('detail.hint')}</p>`;
  head.textContent = t('head.kafra');
  if (sel?.type === 'agent') {
    const found = findAgent(snapshot, sel.id);
    if (found) { html = agentDetail(found); head.textContent = t('head.agent'); }
  } else if (sel?.type === 'town') {
    const town = snapshot.towns.find((x) => x.id === sel.id);
    if (town) html = townDetail(town);
  } else if (sel?.type === 'district') {
    const town = snapshot.towns.find((x) => x.id === sel.town);
    if (town) { html = districtDetail(town, sel.name); head.textContent = t('head.building'); }
  } else if (sel?.type === 'civic') {
    const town = snapshot.towns.find((x) => x.id === sel.town);
    if (town) html = civicDetail(town, sel.key);
  }
  // Skip identical re-renders so a text selection survives the 2s poll.
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
  el.onclick = (e) => {
    const a = e.target.closest('a[data-agent], a[data-district]');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.agent) pickHandler({ type: 'agent', id: a.dataset.agent });
    else {
      const town = sel?.type === 'town' ? sel.id : sel?.town;
      pickHandler({ type: 'district', town, name: a.dataset.district });
    }
  };
}

/* ── Chat log ───────────────────────────────────────────────────────────── */

const MAX_LOG = 80;

export function logEvent(ev, pick) {
  pickHandler = pick;
  const el = $('log');
  const who = ev.agent ? (ev.agent.isParty ? ev.agent.agentType : ev.agent.job) : '';
  let text = '';
  let cls = '';
  switch (ev.type) {
    case 'tool': {
      const tool = ev.tool;
      text = t('log.tool', { who, kind: kindLabel(tool.kind), target: tool.file ? basename(tool.file) : tool.label ?? '' });
      cls = `k-${tool.kind}`;
      break;
    }
    case 'error':
      text = t('log.error', { who, tool: `${ev.tool.name} ${ev.tool.file ? basename(ev.tool.file) : ev.tool.label ?? ''}`.trim() });
      cls = 'bad';
      break;
    case 'waiting':
      text = t('log.waiting', { who });
      cls = 'warn';
      break;
    case 'longrun':
      text = t('log.longrun', { who, d: duration(now() - Date.parse(ev.tool.at)), tool: ev.tool.label ?? ev.tool.name });
      cls = 'warn';
      break;
    case 'lowhp':
      text = t('log.lowhp', { who, hp: ev.agent.hp });
      cls = 'bad';
      break;
    case 'arrive':
      text = t('log.arrive', { who });
      cls = 'sys';
      break;
    case 'commit':
      text = `🏆 Commit ${ev.commit.hash}: ${ev.commit.subject} (+${ev.commit.added} −${ev.commit.removed})`;
      cls = 'gold';
      break;
    default:
      return;
  }
  const line = document.createElement('div');
  line.className = `line ${cls}`;
  const time = new Date(now()).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const kind = ev.type === 'tool' ? ev.tool.kind : ev.type === 'waiting' ? 'waiting' : ev.type === 'commit' ? 'deliver' : null;
  line.innerHTML = `<span class="t">${time}</span> <span class="where">[${esc(ev.town.town)}]</span> ${kind && iconFor(kind) ? icon(kind) + ' ' : ''}${esc(text)}`;
  alert(ev, text);
  if (ev.agent) line.onclick = () => pick({ type: 'agent', id: ev.agent.id });
  else line.onclick = () => pick({ type: 'town', id: ev.town.id });
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
  el.append(line);
  while (el.children.length > MAX_LOG) el.firstChild.remove();
  if (atBottom) el.scrollTop = el.scrollHeight;
}

export function logSystem(text) {
  const line = document.createElement('div');
  line.className = 'line sys';
  line.textContent = text;
  $('log').append(line);
}

/* ── Party bar ──────────────────────────────────────────────────────────── */

const memberName = (a) => (a.isParty ? a.agentType ?? 'party' : a.job);

function portrait(a) {
  if (!characterSheets.has(a.sprite)) return '<span class="portrait none"></span>';
  return `<span class="portrait" style="background-image:url('/assets/characters/${esc(a.sprite)}.png')"></span>`;
}

function memberAction(a) {
  const st = statusOf(a);
  if (st === 'waiting') return `${icon('waiting')} ${esc(a.preview || kindLabel('waiting'))}`;
  if (st === 'idle') return `${icon(a.kind)} ${esc(kindLabel(a.kind))}`;
  const target = a.file ? basename(a.file) : a.tool?.label ?? '';
  return `${icon(a.kind)} <b>${esc(kindLabel(a.kind))}</b> ${esc(target)}`;
}

/**
 * Every agent that isn't asleep, most urgent first: waiting on you, then
 * errors, then working, then idle. Sleeping agents collapse into a count.
 */
export function renderParty(snapshot, selection, pick) {
  const el = $('party');
  const all = snapshot.towns.flatMap((town) => town.agents.map((a) => ({ a, town })));
  const awake = all.filter(({ a }) => a.status !== 'resting');
  awake.sort((x, y) => STATUS[statusOf(x.a)].rank - STATUS[statusOf(y.a)].rank || since(x.a) - since(y.a));
  const asleep = all.length - awake.length;

  const at = now();
  el.innerHTML = awake.map(({ a, town }) => {
    const st = statusOf(a);
    const sel = selection?.type === 'agent' && selection.id === a.id;
    return `
      <button class="member s-${st} ${sel ? 'sel' : ''}" data-id="${esc(a.id)}" style="--st:${STATUS[st].css}" title="${esc(a.title || '')}">
        ${portrait(a)}
        <span class="m-name">${esc(memberName(a))}${a.source && a.source !== 'claude-code' ? ` <span class="m-src">${esc(a.sourceName ?? a.source)}</span>` : ''}</span>
        <span class="m-town">${esc(town.town)} · ${esc(town.name)}</span>
        <span class="m-act">${memberAction(a)}</span>
        <span class="m-meta"><span class="m-st">${esc(t(`status.${st}`))}</span>
          <span class="m-time" data-since="${since(a)}">${duration(at - since(a))}</span>
          ${hpBar(a.hp)}</span>
      </button>`;
  }).join('') + (asleep ? `<span class="party-more">${t('party.asleep', { n: asleep })}</span>` : '')
    || `<span class="party-more">${t('party.none')}</span>`;

  el.onclick = (e) => {
    const b = e.target.closest('.member');
    if (b) pick({ type: 'agent', id: b.dataset.id });
  };

  const waiting = awake.filter(({ a }) => statusOf(a) === 'waiting').length;
  document.title = waiting ? `(${waiting}) Kafra City` : 'Kafra City';
}

/** Durations tick every second between server updates. */
setInterval(() => {
  for (const el of document.querySelectorAll('.m-time[data-since]')) {
    el.textContent = duration(now() - Number(el.dataset.since));
  }
}, 1000);

/* ── Alerts ─────────────────────────────────────────────────────────────── */

const ALERT_TYPES = new Set(['waiting', 'error', 'longrun', 'lowhp']);
const prefs = { notify: false, sound: false, music: false };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('kafra.alerts') ?? '{}')); } catch { /* private mode */ }
const savePrefs = () => { try { localStorage.setItem('kafra.alerts', JSON.stringify(prefs)); } catch { /* ignore */ } };

/** Higher chime for "your turn", lower for trouble. */
const chime = (type) => sfx(type === 'waiting' ? 'chimeUp' : 'chimeDown');

function alert(ev, text) {
  if (!ALERT_TYPES.has(ev.type) || quiet()) return;
  chime(ev.type);
  // A browser notification only when the tab is out of sight; on screen, the party bar already says it.
  if (prefs.notify && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(`Kafra · ${ev.town.town}`, { body: text, tag: `${ev.agent?.id}:${ev.type}`, silent: prefs.sound });
      n.onclick = () => { window.focus(); n.close(); };
    } catch { /* blocked */ }
  }
}

function paintToggles() {
  const n = $('notify'), s = $('sound'), m = $('music');
  m.classList.toggle('on', prefs.music);
  m.textContent = `🎵 ${t('tg.music')}${prefs.music ? ` ${t('on')}` : ''}`;
  const granted = 'Notification' in window && Notification.permission === 'granted';
  n.classList.toggle('on', prefs.notify && granted);
  n.textContent = prefs.notify && granted ? `🔔 ${t('tg.notify')} ${t('on')}` : `🔕 ${t('tg.notify')}`;
  s.classList.toggle('on', prefs.sound);
  s.textContent = `${prefs.sound ? '🔊' : '🔈'} ${t('tg.sound')}${prefs.sound ? ` ${t('on')}` : ''}`;
}

/** Re-label everything after a language switch. */
export function repaintStatic() { paintToggles(); }

export function bindAlerts() {
  $('notify').onclick = async () => {
    if (!('Notification' in window)) return;
    const wasGranted = Notification.permission === 'granted';
    if (!wasGranted) await Notification.requestPermission();
    // Granting turns it on; once granted, the button toggles.
    prefs.notify = Notification.permission === 'granted' && (!wasGranted || !prefs.notify);
    savePrefs();
    paintToggles();
  };
  $('sound').onclick = () => {
    prefs.sound = !prefs.sound;
    setSfx(prefs.sound);
    savePrefs();
    paintToggles();
    if (prefs.sound) chime('waiting');
  };
  $('music').onclick = () => {
    prefs.music = !prefs.music;
    setMusic(prefs.music);
    savePrefs();
    paintToggles();
  };
  // Saved preferences can't start audio by themselves: browsers need a gesture.
  // Arm them, and the first click anywhere on the page turns them back on.
  if (prefs.sound || prefs.music) {
    window.addEventListener('pointerdown', () => {
      if (prefs.sound) setSfx(true);
      if (prefs.music) setMusic(true);
    }, { once: true });
  }
  paintToggles();
}

export function setStatus(text, ok) {
  const el = $('conn');
  el.textContent = text;
  el.className = `conn ${ok ? 'on' : 'off'}`;
}

/** Tab cycles through active agents; Esc clears the selection. */
export function bindKeys({ focus, snapshot, world, replayKey, playKey }) {
  pickHandler = focus;
  let i = -1;
  window.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const active = snapshot().towns.flatMap((t) => t.agents.filter((a) => a.status !== 'resting'));
      if (!active.length) return;
      i = (i + (e.shiftKey ? -1 : 1) + active.length) % active.length;
      focus({ type: 'agent', id: active[i].id });
    }
    if (e.key === 'Escape') focus(null);
    if (e.key === 'm' || e.key === 'M') world?.();
    if (e.key === 'r' || e.key === 'R') replayKey?.();
    if (e.key === ' ' && document.body.classList.contains('replaying')) { e.preventDefault(); playKey?.(); }
  });
}
