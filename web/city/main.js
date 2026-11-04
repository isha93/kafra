/**
 * Kafra City: every repo with an agent in it is a town, every agent walks it.
 *
 * Data arrives over /api/world/stream every two seconds; the scene runs at
 * display rate in between, so walking and swinging stay smooth while the data
 * underneath is coarse.
 */
import { Application, Container, TextureSource } from '/vendor/pixi.mjs';
import { Town, growthKey } from './town.js';
import { iso, SIZE } from './layout.js';
import { layoutWorld, drawWorld, townCentre, TownMarker, Traveler } from './world.js';
import * as ui from './ui.js';
import { loadArt } from './assets.js';
import { skyAt, isStormy } from './sky.js';
import { bindStage, setMusicMood } from './audio.js';
import { replay } from './replay.js';
import { renderNewspaper } from './newspaper.js';
import { t, initBrowserLang, adoptServerLang, applyStatic, setLang, lang, locale } from './i18n.js';

initBrowserLang();
applyStatic();

TextureSource.defaultOptions.scaleMode = 'nearest';

const app = new Application();
await app.init({
  resizeTo: document.getElementById('stage'),
  // The open sea between kingdoms.
  background: 0x1d4a6e,
  antialias: false,
  resolution: window.devicePixelRatio,
  autoDensity: true,
});
document.getElementById('stage').append(app.canvas);
await loadArt();
bindStage(app);

const world = new Container();
app.stage.addChild(world);
// Land under towns, towns sorted front-to-back, far-zoom pins and travellers on top.
const landLayer = new Container();
const townLayer = new Container();
townLayer.sortableChildren = true;
const markerLayer = new Container();
const travelLayer = new Container();
world.addChild(landLayer, townLayer, travelLayer, markerLayer);

/** Below this zoom the map reads as a world map: pins replace town titles. */
const FAR = 0.45;

/* ── Camera: drag to pan, wheel to zoom, fly to a town ──────────────────── */

/** `follow` keeps the selected agent in view until the user drags the map. */
const cam = { x: 0, y: 0, zoom: 1, fly: null, follow: false };

function applyCamera() {
  world.scale.set(cam.zoom);
  world.position.set(app.screen.width / 2 - cam.x * cam.zoom, app.screen.height / 2 - cam.y * cam.zoom);
}

function flyTo(x, y, zoom = cam.zoom) {
  cam.fly = { from: { x: cam.x, y: cam.y, zoom: cam.zoom }, to: { x, y, zoom }, t: 0 };
}

let drag = null;
// Set during the move rather than on pointerup: Pixi may dispatch the tap first.
let wasDrag = false;
app.canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: false }; wasDrag = false; });
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) { drag.moved = wasDrag = true; cam.follow = false; }
  cam.x -= dx / cam.zoom;
  cam.y -= dy / cam.zoom;
  cam.fly = null;
  drag.x = e.clientX;
  drag.y = e.clientY;
});
window.addEventListener('pointerup', () => { drag = null; });
app.canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const before = { x: (e.offsetX - world.x) / cam.zoom, y: (e.offsetY - world.y) / cam.zoom };
  cam.zoom = Math.min(3, Math.max(0.06, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
  // Keep the point under the cursor fixed while zooming.
  cam.x = before.x - (e.offsetX - app.screen.width / 2) / cam.zoom;
  cam.y = before.y - (e.offsetY - app.screen.height / 2) / cam.zoom;
  cam.fly = null;
}, { passive: false });

/* ── Towns ──────────────────────────────────────────────────────────────── */

const towns = new Map();   // id → { town, marker }
let layout = { key: '', positions: new Map(), kingdoms: [] };
let land = null;
const agentHome = new Map(); // agent id → town id, to spot agents changing repo
const travellers = [];
let snapshot = { towns: [] };
let selection = null;
let firstData = true;

function select(sel) {
  selection = sel;
  if (sel?.type !== 'agent') cam.follow = false;
  for (const { town } of towns.values()) {
    for (const s of town.agents.values()) s.setSelected(sel?.type === 'agent' && s.data.id === sel.id);
  }
  ui.showDetail(sel, snapshot);
  ui.renderParty(snapshot, sel, (s) => { select(s); focus(s); });
}

function onEvent(ev) { ui.logEvent(ev, (sel) => { select(sel); focus(sel); }); }

/** Fly the camera to whatever was picked in a panel. */
function focus(sel) {
  if (!sel) return;
  if (sel.type === 'town') {
    const o = layout.positions.get(sel.id);
    if (o) { const c = townCentre(o); flyTo(c.x, c.y, Math.max(cam.zoom, 0.9)); }
    return;
  }
  if (sel.type === 'agent') {
    for (const { town } of towns.values()) {
      const s = town.agent(sel.id);
      if (!s) continue;
      const p = s.view.getGlobalPosition();
      const local = world.toLocal(p);
      flyTo(local.x, local.y - 20, Math.max(cam.zoom, 1.6));
      cam.follow = true;
      return;
    }
  }
}

app.stage.eventMode = 'static';
app.stage.hitArea = app.screen;
app.stage.on('pointertap', () => { if (!wasDrag) select(null); });

/** Fly out until every kingdom fits on screen. */
function fitWorld() {
  if (!layout.kingdoms.length) return;
  const pts = layout.kingdoms.flatMap((k) => [iso(k.x0 - 8, k.y0 - 8), iso(k.x1 + SIZE + 8, k.y0 - 8), iso(k.x1 + SIZE + 8, k.y1 + SIZE + 8), iso(k.x0 - 8, k.y1 + SIZE + 8)]);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys) + 300;
  const zoom = Math.max(0.06, Math.min(0.6, (app.screen.width - 120) / w, (app.screen.height - 260) / h));
  flyTo((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2 - 80, zoom);
  cam.follow = false;
}

/** Agents whose session moved to another repo walk the road between the two towns. */
function spotTravellers(data) {
  for (const t of data.towns) {
    for (const a of t.agents) {
      const was = agentHome.get(a.id);
      if (was && was !== t.id && layout.positions.has(was)) {
        travellers.push(new Traveler(travelLayer, a.sprite, townCentre(layout.positions.get(was)), townCentre(layout.positions.get(t.id))));
      }
      agentHome.set(a.id, t.id);
    }
  }
}

/** Drop every town, so the next render builds afresh without "arrived" noise. */
function resetWorld() {
  for (const [, { town, marker }] of towns) { town.destroy(); marker.view.destroy({ children: true }); }
  towns.clear();
  agentHome.clear();
  layout = { key: '', positions: new Map(), kingdoms: [] };
}

function render(data) {
  snapshot = data;
  if (data.error) { ui.setStatus(data.error, false); return; }

  const next = layoutWorld(data.towns);
  if (next.key !== layout.key) {
    land?.destroy({ children: true });
    land = drawWorld(next);
    landLayer.addChild(land);
  }
  layout = next;

  const pick = (sel) => { select(sel); focus(sel); };
  const seen = new Set();
  data.towns.forEach((t) => {
    seen.add(t.id);
    let entry = towns.get(t.id);
    if (!entry) {
      entry = { town: new Town(t, { onSelect: (sel) => select(sel), onEvent }), marker: new TownMarker(() => pick({ type: 'town', id: t.id })) };
      towns.set(t.id, entry);
      townLayer.addChild(entry.town.view);
      markerLayer.addChild(entry.marker.view);
    } else if (entry.town.key !== growthKey(t)) {
      // Grew a tier, changed biome or mood: rebuild the town where it stands.
      const before = entry.town.tier?.stars ?? 0;
      entry.town.destroy();
      entry.town = new Town(t, { onSelect: (sel) => select(sel), onEvent });
      townLayer.addChild(entry.town.view);
      if ((t.tier?.stars ?? 0) > before && !replay.active) entry.town.celebrateTier();
    } else {
      entry.town.apply(t);
    }
    const o = layout.positions.get(t.id);
    const p = iso(o.x, o.y);
    entry.town.view.position.set(p.x, p.y);
    entry.town.view.zIndex = p.y;
    const c = townCentre(o);
    entry.marker.view.position.set(c.x, c.y);
    entry.marker.update(t);
  });
  for (const [id, { town, marker }] of towns) {
    if (!seen.has(id)) { town.destroy(); marker.view.destroy({ children: true }); towns.delete(id); }
  }
  spotTravellers(data);

  ui.renderTowns(data, selection, (sel) => { select(sel); focus(sel); });
  ui.renderParty(data, selection, (sel) => { select(sel); focus(sel); });
  if (selection) ui.showDetail(selection, snapshot);

  if (firstData && data.towns.length) {
    // Open on the whole world; the busiest town is selected in the Kafra panel.
    firstData = false;
    fitWorld();
    cam.fly.t = 1;
    select({ type: 'town', id: data.towns[0].id });
    // A link like #agent=<id> (from the menu bar) jumps straight to that agent.
    followHash();
  }
}

/** #agent=<id> or #town=<id> in the URL: select it and fly there. */
function followHash() {
  const m = location.hash.match(/^#(agent|town)=(.+)$/);
  if (!m) return;
  const sel = { type: m[1], id: decodeURIComponent(m[2]) };
  // Agents need their sprite placed before the camera can find them.
  requestAnimationFrame(() => { select(sel); focus(sel); });
}
window.addEventListener('hashchange', followHash);

/** Where the selected agent is on the map, or null. */
function selectedAgentPoint() {
  if (selection?.type !== 'agent') return null;
  for (const { town } of towns.values()) {
    const s = town.agent(selection.id);
    if (s) return world.toLocal(s.view.getGlobalPosition());
  }
  return null;
}

let sky = skyAt();
setInterval(() => { sky = skyAt(); }, 30_000);

/** Music follows what's on screen: the nearest town's biome, or the world theme from afar. */
setInterval(() => {
  let biome = 'world', storm = false;
  if (cam.zoom >= FAR && towns.size) {
    let best = null, bestD = Infinity;
    for (const [id, { town }] of towns) {
      const o = layout.positions.get(id);
      if (!o) continue;
      const c = townCentre(o);
      const d = Math.hypot(c.x - cam.x, c.y - cam.y);
      if (d < bestD) { bestD = d; best = town; }
    }
    if (best?.data) { biome = best.data.biome?.id ?? 'plains'; storm = isStormy(best.data); }
  }
  setMusicMood({ biome, night: sky.glow > 0.5, storm });
}, 1000);

app.ticker.add((ticker) => {
  const dt = Math.min(0.1, ticker.deltaMS / 1000);
  if (cam.follow && !cam.fly && !drag) {
    const p = selectedAgentPoint();
    if (p) {
      const k = 1 - Math.exp(-dt * 3);
      cam.x += (p.x - cam.x) * k;
      cam.y += (p.y - 20 - cam.y) * k;
    }
  }
  if (cam.fly) {
    const f = cam.fly;
    f.t = Math.min(1, f.t + dt / 0.6);
    const e = 1 - Math.pow(1 - f.t, 3);
    cam.x = f.from.x + (f.to.x - f.from.x) * e;
    cam.y = f.from.y + (f.to.y - f.from.y) * e;
    cam.zoom = f.from.zoom + (f.to.zoom - f.from.zoom) * e;
    if (f.t >= 1) cam.fly = null;
  }
  applyCamera();
  const far = cam.zoom < FAR;
  for (const { town, marker } of towns.values()) {
    town.sky = sky;
    town.tick(dt, cam.zoom);
    town.title.visible = !far;
    marker.view.visible = far;
    if (far) marker.tick(dt, cam.zoom);
  }
  // Kingdom banners belong to the world view; up close they would cover towns.
  if (land) {
    for (const b of land.children) {
      if (!b.isBanner) continue;
      b.visible = cam.zoom < 0.6;
      // Constant size on screen, like the town pins.
      b.scale.set(Math.min(5, 0.55 / cam.zoom));
    }
  }
  for (let i = travellers.length - 1; i >= 0; i--) if (travellers[i].tick(dt)) travellers.splice(i, 1);
});

/* ── Replay and newspaper ───────────────────────────────────────────────── */

let liveSnapshot = null;
ui.setClock(() => replay.now());
ui.setQuiet(() => replay.active);

const news = document.getElementById('news');
function openNews(data) {
  if (!data) return;
  renderNewspaper(data, news);
  news.hidden = false;
}
news.addEventListener('click', (e) => {
  if (e.target.closest('.np-close')) { news.hidden = true; return; }
  const jump = e.target.closest('.np-jump');
  if (!jump) return;
  e.preventDefault();
  news.hidden = true;
  replay.seek(Number(jump.dataset.t) + 1000);
  if (jump.dataset.agent) requestAnimationFrame(() => { const sel = { type: 'agent', id: jump.dataset.agent }; select(sel); focus(sel); });
});

replay.bind({
  onFrame: (frame) => { if (!replay.rendered) { resetWorld(); replay.rendered = true; } render(frame); },
  onExit: () => {
    replay.rendered = false;
    news.hidden = true;
    resetWorld();
    ui.logSystem(t('log.live'));
    if (liveSnapshot) render(liveSnapshot);
  },
  onLoad: (data) => { replay.rendered = false; ui.logSystem(t('log.replay', { date: new Date(data.from).toLocaleDateString(locale()) })); },
  onNews: openNews,
});
document.getElementById('replay-open').onclick = () => (replay.active ? replay.close() : replay.open());
document.getElementById('news-open').onclick = async () => {
  if (!replay.active) await replay.open();
  openNews(replay.data);
};
app.ticker.add((ticker) => replay.tick(Math.min(0.1, ticker.deltaMS / 1000)));

const source = new EventSource('/api/world/stream');
source.onopen = () => ui.logSystem(t('log.connected'));
source.onmessage = (e) => {
  ui.setStatus(t('conn.live'), true);
  liveSnapshot = JSON.parse(e.data);
  // Follow the server's language (your Mac's) unless this browser chose one.
  if (adoptServerLang(liveSnapshot.lang)) relabel();
  // While replaying, the live world waits in the wings.
  if (!replay.active) render(liveSnapshot);
};
source.onerror = () => ui.setStatus(t('conn.lost'), false);

/**
 * Switch language: static labels, toggles, and the towns (their signboards
 * are drawn into the canvas) are rebuilt; panels re-render on the next update.
 */
function relabel() {
  applyStatic();
  ui.repaintStatic();
  document.getElementById('lang').textContent = lang() === 'id' ? '🌐 EN' : '🌐 ID';
  resetWorld();
  const current = replay.active ? null : liveSnapshot;
  if (current) render(current);
  else if (replay.active) replay.seek(replay.t);
  if (!news.hidden && replay.data) openNews(replay.data);
}
document.getElementById('lang').onclick = () => {
  setLang(lang() === 'id' ? 'en' : 'id', { remember: true });
  relabel();
};
document.getElementById('lang').textContent = lang() === 'id' ? '🌐 EN' : '🌐 ID';

ui.bindKeys({
  focus: (sel) => { if (!sel && replay.active && !news.hidden) { news.hidden = true; return; } select(sel); focus(sel); },
  snapshot: () => snapshot,
  world: fitWorld,
  replayKey: () => (replay.active ? replay.close() : replay.open()),
  playKey: () => replay.toggle(),
});
ui.bindAlerts();
