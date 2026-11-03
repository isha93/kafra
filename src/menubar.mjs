/**
 * The menu bar view, as SwiftBar plugin text.
 *
 * The plugin itself (integrations/swiftbar/kafra.10s.sh) is just curl: it
 * can't rely on Node being on SwiftBar's PATH. So the formatting lives here,
 * where it is tested and goes through the same privacy rules as the city.
 *
 * Lines starting with "#notify " are not menu items: the plugin reads them to
 * send a native notification once per agent that starts waiting, then strips
 * them before SwiftBar sees the output.
 */
import { STATUS, statusOf, since, duration } from '../web/city/status.js';

const KIND_LABEL = {
  build: 'membangun', research: 'meneliti', craft: 'meracik', trial: 'uji coba',
  deliver: 'menyetor', teleport: 'teleport', summon: 'memanggil party', ask: 'bertanya',
  cast: 'berpikir', waiting: 'menunggu giliranmu', idle: 'idle', resting: 'istirahat',
};
const SECTION = { waiting: '⏳ Nunggu kamu', error: '⚠️ Error', working: '⚒ Kerja', idle: '💤 Idle' };

/** SwiftBar splits on "|" and newlines; keep both out of item text. */
const clean = (s) => String(s ?? '').replace(/[|\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
const basename = (p) => String(p ?? '').split('/').filter(Boolean).pop() ?? '';

function what(a) {
  if (statusOf(a) === 'waiting') return clean(a.preview) || 'menunggu giliranmu';
  const target = a.file ? basename(a.file) : a.tool?.label ?? '';
  return clean(`${KIND_LABEL[a.kind] ?? a.kind}${target ? ` ${target}` : ''}`);
}

export function swiftbarText(world, { port, now = Date.now() } = {}) {
  const base = `http://127.0.0.1:${port}/`;
  const all = (world.towns ?? []).flatMap((t) => t.agents.map((a) => ({ a, t })));
  const awake = all.filter(({ a }) => a.status !== 'resting');
  const by = (st) => awake.filter(({ a }) => statusOf(a) === st);
  const waiting = by('waiting'), errors = by('error'), working = by('working');

  // Title: the number that matters most, coloured by urgency.
  let title = '⚔';
  if (waiting.length) title = `⚔ ${waiting.length} | color=${STATUS.waiting.css}`;
  else if (errors.length) title = `⚔ ! | color=${STATUS.error.css}`;
  else if (working.length) title = `⚔ ${working.length} | color=${STATUS.working.css}`;
  else title = '⚔ | color=#8a8a8a';

  const lines = [title, '---', `Kafra City | href=${base}`];
  if (world.public) lines.push('🔒 mode publik | color=#2a4f8a');
  if (world.error) lines.push(`${clean(world.error)} | color=${STATUS.error.css}`);

  for (const st of ['waiting', 'error', 'working', 'idle']) {
    const list = by(st).sort((x, y) => since(x.a) - since(y.a));
    if (!list.length) continue;
    lines.push('---', `${SECTION[st]} (${list.length}) | color=${STATUS[st].css}`);
    for (const { a, t } of list) {
      const who = a.isParty ? a.agentType ?? 'party' : a.job;
      const href = `${base}#agent=${encodeURIComponent(a.id)}`;
      lines.push(`${clean(who)} · ${clean(t.town)} — ${what(a)} · ${duration(now - since(a))} | href=${href} length=70`);
    }
  }
  const asleep = all.length - awake.length;
  lines.push('---');
  if (asleep) lines.push(`+${asleep} istirahat | color=#8a8a8a`);
  lines.push(`${(world.towns ?? []).length} kota | href=${base}`);

  // Notification hints for the plugin: one per agent waiting for you.
  for (const { a, t } of waiting) {
    lines.push(`#notify ${encodeURIComponent(a.id)} ${clean(`${a.isParty ? a.agentType : a.job} di ${t.town} menunggu giliranmu`)}`);
  }
  return lines.join('\n') + '\n';
}
