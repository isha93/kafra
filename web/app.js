/**
 * Party window client.
 *
 * Rows are keyed by session id and patched in place rather than re-rendered, so
 * the HP bar animates and a row you are reading does not jump under the cursor
 * every two seconds.
 */

import { t, locale, initBrowserLang, applyStatic } from './city/i18n.js';

initBrowserLang();
applyStatic();

const rowsEl = document.getElementById('rows');
const countEl = document.getElementById('count');
const connEl = document.getElementById('conn');
const scannedEl = document.getElementById('scanned');

/** Accent per job class. Original shapes — see the asset note in README.md. */
const ACCENT = {
  knight: '#c0392b',
  assassin: '#6c3483',
  hunter: '#1e8449',
  bard: '#2471a3',
  novice: '#7f8c8d',
};

function spriteSVG(kind) {
  const c = ACCENT[kind] ?? ACCENT.novice;
  return `<svg class="sprite" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
    <rect x="5" y="2" width="6" height="5" fill="#f2d2a9"/>
    <rect x="4" y="1" width="8" height="3" fill="${c}"/>
    <rect x="6" y="4" width="1" height="1" fill="#2e2416"/>
    <rect x="9" y="4" width="1" height="1" fill="#2e2416"/>
    <rect x="4" y="7" width="8" height="6" fill="${c}"/>
    <rect x="3" y="8" width="1" height="4" fill="${c}"/>
    <rect x="12" y="8" width="1" height="4" fill="${c}"/>
    <rect x="5" y="13" width="2" height="2" fill="#4a3826"/>
    <rect x="9" y="13" width="2" height="2" fill="#4a3826"/>
  </svg>`;
}

function hpClass(hp) {
  if (hp <= 20) return 'hp low';
  if (hp <= 50) return 'hp mid';
  return 'hp';
}

const STATUS_LABEL = { active: 'pw.casting', idle: 'pw.idle', resting: 'pw.resting' };

function ago(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return t('ago.s', { n: s });
  const m = Math.round(s / 60);
  if (m < 60) return t('ago.m', { n: m });
  return t('ago.h', { n: Math.round(m / 60) });
}

function rowHTML(s) {
  const where = [s.branch && `⎇ ${s.branch}`, s.isParty && t('pw.party')]
    .filter(Boolean)
    .join(' · ');
  return `
    ${spriteSVG(s.sprite)}
    <span>
      <span class="name">${esc(s.map)}</span>
      <span class="where">${esc(where)}</span>
    </span>
    <span class="job">${esc(s.job)}</span>
    <span class="hp-wrap">
      <span class="${hpClass(s.hp)}"><i style="width:${s.hp}%"></i></span>
      <span class="hp-text">${s.hp}% &middot; ${s.tokens.toLocaleString(locale())} tok</span>
    </span>
    <span class="status ${s.status}"><span class="dot"></span>${STATUS_LABEL[s.status] ? t(STATUS_LABEL[s.status]) : s.status}</span>
    <span class="preview" title="${esc(s.cwd)}">${esc(s.preview || '—')} <em>(${ago(s.ageMs)})</em></span>
  `;
}

function esc(v) {
  return String(v ?? '').replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function render({ sessions = [], scannedAt, error }) {
  countEl.textContent = error ? '!' : t('pw.count', { n: sessions.length });
  scannedEl.textContent = scannedAt
    ? t('pw.scanned', { time: new Date(scannedAt).toLocaleTimeString(locale()) })
    : '';

  if (error) {
    rowsEl.innerHTML = `<div class="empty">${esc(error)}</div>`;
    return;
  }
  if (!sessions.length) {
    rowsEl.innerHTML = `<div class="empty">${esc(t('pw.none'))}</div>`;
    return;
  }

  const seen = new Set();
  for (const s of sessions) {
    seen.add(s.id);
    let row = rowsEl.querySelector(`[data-id="${CSS.escape(s.id)}"]`);
    if (!row) {
      row = document.createElement('div');
      row.className = 'row';
      row.dataset.id = s.id;
      rowsEl.append(row);
    }
    row.innerHTML = rowHTML(s);
  }
  for (const row of [...rowsEl.children]) {
    if (row.dataset.id && !seen.has(row.dataset.id)) row.remove();
    if (row.classList.contains('empty')) row.remove();
  }
  // Freshest first, matching the server's own ordering.
  const order = new Map(sessions.map((s, i) => [s.id, i]));
  [...rowsEl.children]
    .sort((a, b) => (order.get(a.dataset.id) ?? 0) - (order.get(b.dataset.id) ?? 0))
    .forEach((el) => rowsEl.append(el));
}

const source = new EventSource('api/stream');
source.onmessage = (e) => {
  connEl.textContent = 'live';
  connEl.className = 'conn on';
  render(JSON.parse(e.data));
};
source.onerror = () => {
  connEl.textContent = t('conn.lost');
  connEl.className = 'conn off';
};
