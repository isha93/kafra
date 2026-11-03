/**
 * The HTML windows around the map: world map, Kafra info window, chat log.
 *
 * Plain DOM on purpose: text in panels should be selectable and copyable, which
 * canvas text is not.
 */

import { iconFor, characterSheets } from './assets.js';
import { repoLabel, districtLabel } from './town.js';
import { STATUS, statusOf, since, duration } from './status.js';

const $ = (id) => document.getElementById(id);

/** Activity icon as HTML: generated art when installed, else the glyph. */
function icon(kind) {
  const art = iconFor(kind);
  return art ? `<img class="ico" src="${art.url}" alt="">` : esc(KIND_ICON[kind] ?? '');
}

export function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const KIND_LABEL = {
  build: 'membangun', research: 'meneliti', craft: 'meracik', trial: 'uji coba',
  deliver: 'menyetor ke Kafra', teleport: 'teleport', summon: 'memanggil party',
  ask: 'bertanya padamu', cast: 'casting', waiting: 'menunggu giliranmu',
  idle: 'idle', resting: 'istirahat',
};
const KIND_ICON = {
  build: '⚒', research: '📖', craft: '⚗', trial: '⚔', deliver: '📦', teleport: '✦',
  summon: '✧', ask: '?', cast: '✶', waiting: '!', idle: '·', resting: 'z',
};

function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} dtk`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} mnt`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} jam` : `${Math.round(h / 24)} hari`;
}

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
  for (const t of data.towns) {
    const k = t.owner || 'Tanah Liar';
    if (!kingdoms.has(k)) kingdoms.set(k, []);
    kingdoms.get(k).push(t);
  }
  el.innerHTML = [...kingdoms].map(([k, list]) => `<div class="kingdom">${esc(k)}</div>` + list.map((t) => `
    <button class="town ${t.id === selTown ? 'sel' : ''}" data-id="${esc(t.id)}">
      <span class="dot ${t.active ? 'on' : ''}"></span>
      <span class="tn">${esc(t.town)} <span class="stars" title="${esc(t.tier?.name ?? '')}">${'★'.repeat(t.tier?.stars ?? 1)}</span></span>
      <span class="tr">${esc(t.name)}</span>
      <span class="tc">${t.agents.length}</span>
    </button>`).join('')).join('') || '<div class="empty">Belum ada adventurer.</div>';
  el.onclick = (e) => {
    const b = e.target.closest('.town');
    if (b) pick({ type: 'town', id: b.dataset.id });
  };
  // Say so when the view is filtered: nobody should mistake public mode for "no data".
  $('mode').textContent = data.public ? '🔒 publik' : data.configError ? '⚠ config' : '';
  $('mode').title = data.configError ?? (data.public ? 'Semua teks disembunyikan oleh server' : '');
  const active = data.towns.reduce((n, t) => n + t.active, 0);
  const total = data.towns.reduce((n, t) => n + t.agents.length, 0);
  $('census').textContent = `${active} aktif · ${total} adventurer · ${data.towns.length} kota`;
}

/* ── Kafra info window ──────────────────────────────────────────────────── */

function findAgent(snapshot, id) {
  for (const t of snapshot.towns) {
    const a = t.agents.find((x) => x.id === id);
    if (a) return { town: t, agent: a };
  }
  return null;
}

function agentDetail({ town, agent: a }) {
  const party = town.agents.filter((x) => x.leader === a.id);
  const leader = a.leader && town.agents.find((x) => x.id === a.leader);
  const doing = KIND_LABEL[a.kind] ?? a.kind;
  const where = a.file ? `<code>${esc(a.file)}</code>` : a.tool?.label ? esc(a.tool.label) : '';
  return `
    <div class="who">
      <div><b>${esc(a.isParty ? a.agentType : a.job)}</b> <span class="muted">${esc(a.model)}</span></div>
      <div class="muted">${esc(town.town)} · ${esc(town.name)}${a.branch ? ` · ⎇ ${esc(a.branch)}` : ''}</div>
    </div>
    ${a.title ? `<div class="quest"><span class="lbl">Quest</span>${esc(a.title)}</div>` : ''}
    <div class="stat"><span class="lbl">HP</span>${hpBar(a.hp)} <span class="muted">${a.hp}% · ${a.tokens.toLocaleString('id-ID')} tok</span></div>
    <div class="stat"><span class="lbl">Sedang</span><span class="kind k-${a.kind}">${icon(a.kind)} ${esc(doing)}</span> ${where}</div>
    <div class="stat"><span class="lbl">Terakhir</span><span class="muted">${ago(a.ageMs)} lalu</span></div>
    ${leader ? `<div class="stat"><span class="lbl">Leader</span><a href="#" data-agent="${esc(leader.id)}">${esc(leader.job)}</a></div>` : ''}
    ${party.length ? `<div class="sub">Party</div><ul class="party">${party.map((p) => `
      <li><a href="#" data-agent="${esc(p.id)}">${esc(p.agentType)}</a> — ${esc(p.title)} <span class="muted">(${esc(KIND_LABEL[p.kind] ?? p.kind)})</span></li>`).join('')}</ul>` : ''}
    ${a.quest ? `<div class="sub">Perintah terakhir</div><p class="say">${esc(a.quest)}</p>` : ''}
    ${a.preview ? `<div class="sub">Ucapan terakhir</div><p class="say">${esc(a.preview)}</p>` : ''}
    <div class="sub">Aktivitas</div>
    <ul class="tools">${(a.tools ?? []).map(toolLine).join('') || '<li class="muted">—</li>'}</ul>`;
}

function commitList(commits) {
  if (!commits.length) return '<p class="muted">Belum ada commit minggu ini.</p>';
  return `<ul class="commits">${commits.slice(0, 15).map((c) => `
    <li><code>${esc(c.hash)}</code> ${esc(c.subject)}
      <span class="muted">+${c.added} −${c.removed} · ${ago(Date.now() - c.at)} lalu</span></li>`).join('')}</ul>`;
}

const MOOD = { bustling: 'ramai', steady: 'tenang', abandoned: 'terbengkalai — tidak ada commit 30 hari' };

/** What the town needs to reach the next tier, as small progress bars. */
function growthLine(t) {
  const g = t.growth, next = t.tier?.next;
  if (!g) return '';
  if (!next) return `<div class="stat"><span class="lbl">Sejarah</span>${g.files.toLocaleString('id-ID')} file · ${g.commitsTotal} commit</div>`;
  const bar = (have, need) => `<span class="hp"><i style="width:${Math.min(100, (have / need) * 100)}%"></i></span>`;
  const ageDays = g.firstCommitAt ? Math.floor((Date.now() - g.firstCommitAt) / 86_400_000) : 0;
  return `
    <div class="sub">Menuju ${esc(next.name)}</div>
    <div class="stat grow"><span class="lbl">File</span>${bar(g.files, next.files)} <span class="muted">${g.files.toLocaleString('id-ID')} / ${next.files}</span></div>
    <div class="stat grow"><span class="lbl">Commit</span>${bar(g.commitsTotal, next.commits)} <span class="muted">${g.commitsTotal} / ${next.commits}</span></div>
    ${next.days ? `<div class="stat grow"><span class="lbl">Umur</span>${bar(ageDays, next.days)} <span class="muted">${ageDays} / ${next.days} hari</span></div>` : ''}`;
}

function townDetail(t) {
  const busy = t.agents.filter((a) => a.status === 'active');
  return `
    <div class="who">
      <div><b>${esc(t.town)}</b></div>
      <div class="muted">${esc(repoLabel(t))}${t.branch ? ` · ⎇ ${esc(t.branch)}` : ''}</div>
    </div>
    <div class="kafra-say">“Selamat datang di Kafra! Ini catatan pembangunan kota ${esc(t.town)}.”</div>
    <div class="stat"><span class="lbl">Tingkat</span><b>${'★'.repeat(t.tier?.stars ?? 1)}${'☆'.repeat(5 - (t.tier?.stars ?? 1))} ${esc(t.tier?.name ?? '')}</b>
      <span class="muted">${esc(MOOD[t.mood] ?? '')}</span></div>
    ${growthLine(t)}
    <div class="stat"><span class="lbl">Wilayah</span>${esc(t.biome?.name ?? '')} <span class="muted">(${esc(t.biome?.languages ?? '')})</span></div>
    <div class="stat"><span class="lbl">Warga</span>${t.agents.length} adventurer, ${busy.length} sedang bekerja</div>
    <div class="stat"><span class="lbl">Bangunan</span>${t.totals.files.toLocaleString('id-ID')} file · ${t.totals.dirty} belum di-commit</div>
    <div class="sub">Adventurer</div>
    <ul class="party">${t.agents.map((a) => `
      <li><a href="#" data-agent="${esc(a.id)}">${esc(a.isParty ? a.agentType : a.job)}</a>
      <span class="kind k-${a.kind}">${icon(a.kind)} ${esc(KIND_LABEL[a.kind] ?? a.kind)}</span>
      <span class="muted">${esc((a.title || '').slice(0, 40))}</span></li>`).join('')}</ul>
    <div class="sub">Distrik</div>
    <ul class="districts">${t.districts.map((d) => `
      <li><a href="#" data-district="${esc(d.name)}">${esc(districtLabel(d.name))}</a>
      <span class="muted">${d.files} file${d.dirty ? ` · 🚧 ${d.dirty}` : ''}${d.churn ? ` · ${d.churn} baris/minggu` : ''}</span></li>`).join('')}</ul>
    <div class="sub">Build log (7 hari)</div>
    ${commitList(t.commits)}
    ${t.error ? `<p class="bad">${esc(t.error)}</p>` : ''}`;
}

function districtDetail(t, name) {
  const d = t.districts.find((x) => x.name === name);
  if (!d) return townDetail(t);
  const builders = t.agents.filter((a) => a.building === name && a.kind === 'build');
  const visited = t.agents.filter((a) => a.touched?.includes(name));
  const commits = t.commits.filter((c) => c.districts.includes(name));
  return `
    <div class="who">
      <div><b>${esc(districtLabel(name))}</b></div>
      <div class="muted">${esc(t.town)} · ${esc(t.name)}</div>
    </div>
    <div class="stat"><span class="lbl">Ukuran</span>${d.files} file</div>
    <div class="stat"><span class="lbl">Konstruksi</span>${d.dirty ? `🚧 ${d.dirty} file belum di-commit` : 'tidak ada'}</div>
    <div class="stat"><span class="lbl">Minggu ini</span>${d.commits} commit · ${d.churn} baris</div>
    ${builders.length ? `<div class="sub">Sedang dibangun oleh</div><ul class="party">${builders.map((a) => `
      <li><a href="#" data-agent="${esc(a.id)}">${esc(a.job)}</a> <code>${esc(a.file ?? '')}</code></li>`).join('')}</ul>` : ''}
    ${visited.length ? `<div class="sub">Pernah dikerjakan</div><ul class="party">${visited.map((a) => `
      <li><a href="#" data-agent="${esc(a.id)}">${esc(a.isParty ? a.agentType : a.job)}</a> <span class="muted">${esc((a.title || '').slice(0, 40))}</span></li>`).join('')}</ul>` : ''}
    <div class="sub">Commit</div>
    ${commitList(commits)}`;
}

const CIVIC_TEXT = {
  library: ['Perpustakaan', 'research', 'Agent yang membaca file atau mencari kode (Read, Grep, Glob) datang ke sini.'],
  workshop: ['Bengkel', 'craft', 'Agent yang menjalankan perintah shell meracik di sini. Cerobong berasap lebih tebal saat ada yang bekerja.'],
  inn: ['Penginapan', 'resting', 'Sesi yang sudah lebih dari 30 menit diam beristirahat di sini.'],
  arena: ['Arena Latihan', 'trial', 'Menjalankan test. Angka damage itu hiasan; "Miss" merah berarti tool-nya gagal.'],
  kafra: ['Kafra', 'deliver', 'Commit dan push disetor ke sini. Setiap commit baru memicu kembang api.'],
};

function civicDetail(t, key) {
  const [title, kind, text] = CIVIC_TEXT[key] ?? [key, '', ''];
  if (key === 'kafra') return townDetail(t);
  const here = t.agents.filter((a) => a.kind === kind);
  return `
    <div class="who"><div><b>${esc(title)}</b></div><div class="muted">${esc(t.town)}</div></div>
    <p class="say">${esc(text)}</p>
    <div class="sub">Di sini sekarang</div>
    <ul class="party">${here.map((a) => `<li><a href="#" data-agent="${esc(a.id)}">${esc(a.isParty ? a.agentType : a.job)}</a>
      ${a.tool?.label ? `<span class="muted">${esc(a.tool.label)}</span>` : ''}</li>`).join('') || '<li class="muted">kosong</li>'}</ul>`;
}

let pickHandler = () => {};

export function showDetail(sel, snapshot) {
  const el = $('detail');
  const head = $('detail-title');
  let html = '<p class="muted">Klik adventurer, bangunan, atau Kafra di kota untuk melihat detail.</p>';
  head.textContent = 'Kafra Service';
  if (sel?.type === 'agent') {
    const found = findAgent(snapshot, sel.id);
    if (found) { html = agentDetail(found); head.textContent = 'Status Adventurer'; }
  } else if (sel?.type === 'town') {
    const t = snapshot.towns.find((x) => x.id === sel.id);
    if (t) html = townDetail(t);
  } else if (sel?.type === 'district') {
    const t = snapshot.towns.find((x) => x.id === sel.town);
    if (t) { html = districtDetail(t, sel.name); head.textContent = 'Bangunan'; }
  } else if (sel?.type === 'civic') {
    const t = snapshot.towns.find((x) => x.id === sel.town);
    if (t) html = civicDetail(t, sel.key);
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
      const t = ev.tool;
      const target = t.file ? basename(t.file) : t.label ?? '';
      text = `${who} ${KIND_LABEL[t.kind] ?? t.kind}: ${target}`;
      cls = `k-${t.kind}`;
      break;
    }
    case 'error':
      text = `${who} gagal — ${ev.tool.name} ${ev.tool.file ? basename(ev.tool.file) : ev.tool.label ?? ''}`;
      cls = 'bad';
      break;
    case 'waiting':
      text = `${who} menunggu giliranmu.`;
      cls = 'warn';
      break;
    case 'longrun':
      text = `${who} sudah ${duration(Date.now() - Date.parse(ev.tool.at))} menjalankan ${ev.tool.label ?? ev.tool.name}`;
      cls = 'warn';
      break;
    case 'lowhp':
      text = `${who} HP tinggal ${ev.agent.hp}% — context hampir penuh`;
      cls = 'bad';
      break;
    case 'arrive':
      text = `${who} tiba di kota.`;
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
  const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
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
  if (st === 'waiting') return `${icon('waiting')} ${esc(a.preview || 'menunggu giliranmu')}`;
  if (st === 'idle') return `${icon(a.kind)} ${esc(KIND_LABEL[a.kind] ?? a.kind)}`;
  const target = a.file ? basename(a.file) : a.tool?.label ?? '';
  return `${icon(a.kind)} <b>${esc(KIND_LABEL[a.kind] ?? a.kind)}</b> ${esc(target)}`;
}

/**
 * Every agent that isn't asleep, most urgent first: waiting on you, then
 * errors, then working, then idle. Sleeping agents collapse into a count.
 */
export function renderParty(snapshot, selection, pick) {
  const el = $('party');
  const all = snapshot.towns.flatMap((t) => t.agents.map((a) => ({ a, t })));
  const awake = all.filter(({ a }) => a.status !== 'resting');
  awake.sort((x, y) => STATUS[statusOf(x.a)].rank - STATUS[statusOf(y.a)].rank || since(x.a) - since(y.a));
  const asleep = all.length - awake.length;

  el.innerHTML = awake.map(({ a, t }) => {
    const st = statusOf(a);
    const sel = selection?.type === 'agent' && selection.id === a.id;
    return `
      <button class="member s-${st} ${sel ? 'sel' : ''}" data-id="${esc(a.id)}" style="--st:${STATUS[st].css}" title="${esc(a.title || '')}">
        ${portrait(a)}
        <span class="m-name">${esc(memberName(a))}</span>
        <span class="m-town">${esc(t.town)} · ${esc(t.name)}</span>
        <span class="m-act">${memberAction(a)}</span>
        <span class="m-meta"><span class="m-st">${STATUS[st].label}</span>
          <span class="m-time" data-since="${since(a)}">${duration(Date.now() - since(a))}</span>
          ${hpBar(a.hp)}</span>
      </button>`;
  }).join('') + (asleep ? `<span class="party-more">+${asleep} istirahat</span>` : '')
    || '<span class="party-more">Tidak ada adventurer yang bangun.</span>';

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
    el.textContent = duration(Date.now() - Number(el.dataset.since));
  }
}, 1000);

/* ── Alerts ─────────────────────────────────────────────────────────────── */

const ALERT_TYPES = new Set(['waiting', 'error', 'longrun', 'lowhp']);
const prefs = { notify: false, sound: false };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('kafra.alerts') ?? '{}')); } catch { /* private mode */ }
const savePrefs = () => { try { localStorage.setItem('kafra.alerts', JSON.stringify(prefs)); } catch { /* ignore */ } };

let audio = null;
/** A short two-note chime; higher for "your turn", lower for trouble. */
function chime(type) {
  if (!prefs.sound) return;
  try {
    audio ??= new AudioContext();
    const notes = type === 'waiting' ? [660, 880] : [440, 330];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      const t0 = audio.currentTime + i * 0.14;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(g).connect(audio.destination);
      o.start(t0);
      o.stop(t0 + 0.32);
    });
  } catch { /* audio unavailable */ }
}

function alert(ev, text) {
  if (!ALERT_TYPES.has(ev.type)) return;
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
  const n = $('notify'), s = $('sound');
  const granted = 'Notification' in window && Notification.permission === 'granted';
  n.classList.toggle('on', prefs.notify && granted);
  n.textContent = prefs.notify && granted ? '🔔 notifikasi on' : '🔕 notifikasi';
  s.classList.toggle('on', prefs.sound);
  s.textContent = prefs.sound ? '🔊 suara on' : '🔈 suara';
}

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
    savePrefs();
    paintToggles();
    if (prefs.sound) chime('waiting');
  };
  paintToggles();
}

export function setStatus(text, ok) {
  const el = $('conn');
  el.textContent = text;
  el.className = `conn ${ok ? 'on' : 'off'}`;
}

/** Tab cycles through active agents; Esc clears the selection. */
export function bindKeys({ focus, snapshot, world }) {
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
  });
}
