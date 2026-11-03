/**
 * Every word Kafra shows, in English and Indonesian.
 *
 * Shared by the browser and the server (the menu bar text is built
 * server-side), so this module touches no DOM at import time.
 *
 * Choosing the language, first match wins:
 *   browser  ?lang=en|id  →  the 🌐 toggle (remembered)  →  the server's language  →  navigator.language
 *   server   KAFRA_LANG  →  LANG / LC_ALL  →  English
 */

const STRINGS = {
  en: {
    'kind.build': 'building', 'kind.research': 'researching', 'kind.craft': 'crafting', 'kind.trial': 'training',
    'kind.deliver': 'delivering to Kafra', 'kind.teleport': 'teleporting', 'kind.summon': 'summoning a party',
    'kind.ask': 'asking you', 'kind.cast': 'thinking', 'kind.waiting': 'waiting for you', 'kind.idle': 'idle', 'kind.resting': 'resting',

    'status.waiting': 'your turn', 'status.error': 'error', 'status.working': 'working', 'status.idle': 'idle',

    'ago.s': '{n}s ago', 'ago.m': '{n} min ago', 'ago.h': '{n} h ago', 'ago.d': '{n} days ago',

    wilds: 'The Wilds', 'no.repo': 'no repo', 'towns.empty': 'No adventurers yet.',
    'mode.public': '🔒 public', 'mode.public.title': 'All text is hidden by the server',
    census: '{active} active · {total} adventurers · {towns} towns',

    'head.kafra': 'Kafra Service', 'head.agent': 'Adventurer', 'head.building': 'Building',
    'detail.hint': 'Click an adventurer, a building or the Kafra booth for details.',
    'lbl.quest': 'Quest', 'lbl.hp': 'HP', 'lbl.doing': 'Doing', 'lbl.last': 'Last seen', 'lbl.leader': 'Leader',
    'sub.party': 'Party', 'sub.prompt': 'Last prompt', 'sub.reply': 'Last reply', 'sub.activity': 'Activity',
    'commits.none': 'No commits this week.',
    'mood.bustling': 'bustling', 'mood.steady': 'steady', 'mood.abandoned': 'abandoned: no commits in 30 days',
    'mood.short.bustling': 'bustling', 'mood.short.abandoned': 'abandoned',
    'lbl.history': 'History', 'history': '{files} files · {commits} commits', 'sub.next': 'Towards {tier}',
    'lbl.file': 'Files', 'lbl.commit': 'Commits', 'lbl.age': 'Age', days: '{n} days',
    'kafra.welcome': '“Welcome to Kafra! Here is the build log of {town}.”',
    'lbl.tier': 'Tier', 'lbl.region': 'Region', 'lbl.folk': 'Folk', folk: '{n} adventurers, {busy} working',
    'lbl.buildings': 'Buildings', buildings: '{files} files · {dirty} uncommitted',
    'sub.adventurers': 'Adventurers', 'sub.districts': 'Districts', 'district.files': '{n} files',
    'lines.week': '{n} lines/week', 'sub.buildlog': 'Build log (7 days)',
    'lbl.size': 'Size', 'lbl.construction': 'Construction', 'construction.n': '🚧 {n} uncommitted files', none: 'none',
    'lbl.week': 'This week', week: '{c} commits · {l} lines',
    'sub.builders': 'Being built by', 'sub.visited': 'Worked on by', 'sub.commits': 'Commits',
    'sub.here': 'Here now', empty: 'empty',

    'civic.library': 'Library', 'civic.workshop': 'Workshop', 'civic.inn': 'Inn', 'civic.arena': 'Training Arena',
    'civic.kafra': 'Kafra', 'civic.warp': 'Warp Portal',
    'civic.library.text': 'Agents reading files or searching code (Read, Grep, Glob) come here.',
    'civic.workshop.text': 'Agents running shell commands craft here. The chimney smokes harder while someone works.',
    'civic.inn.text': 'Sessions quiet for more than 30 minutes rest here.',
    'civic.arena.text': 'Running tests. The damage numbers are for show; a red "Miss" means the tool failed.',
    'civic.kafra.text': 'Commits and pushes are delivered here. Every new commit sets off fireworks.',
    townhall: 'Town Hall', 'district.n': 'District {n}', 'kingdom.n': 'Kingdom {n}', 'kingdom.of': 'Kingdom of {name}', 'towns.count': '{n} towns',

    'biome.coast': 'Coast', 'biome.desert': 'Desert', 'biome.plains': 'Plains', 'biome.snow': 'Snowy peaks',
    'biome.forest': 'Forest', 'biome.meadow': 'Flower meadow', 'biome.canyon': 'Canyon',

    'log.tool': '{who} {kind}: {target}', 'log.error': '{who} failed: {tool}', 'log.waiting': '{who} is waiting for you.',
    'log.longrun': '{who} has been running {tool} for {d}', 'log.lowhp': '{who} has {hp}% HP left: context almost full',
    'log.arrive': '{who} arrived in town.', 'log.connected': 'Connected to Kafra. Watching every adventurer (read-only).',
    'log.live': 'Back to the present.', 'log.replay': 'Replay of {date} loaded.',
    'conn.live': 'live', 'conn.lost': 'disconnected, retrying',

    'party.asleep': '+{n} resting', 'party.none': 'No adventurers awake.',
    'tg.notify': 'notifications', 'tg.sound': 'sound', 'tg.music': 'music', on: 'on',
    'bubble.waiting': 'Your turn!', 'bubble.thinking': 'thinking…',

    'rb.loading': 'loading…', 'rb.failed': 'failed: {e}', 'rb.commit': 'commit', 'rb.fail': 'failed',

    'np.title': 'The Kafra Times', 'np.quiet': 'A quiet day. Not one adventurer worked.',
    'np.headline.commits': '{c} commits delivered in {t} towns', 'np.headline.none': '{n} adventurers worked without a commit',
    'np.lead.agents': '{n} adventurers worked in {t} towns', 'np.lead.actions': '{n} actions', 'np.lead.files': '{n} files built',
    'np.lead.fails': '{n} failures', 'np.lead.fixed': ', {n} fixed', 'np.lead.clean': 'not a single failure',
    'np.highlights': 'Highlights', 'np.best': 'Best builder', 'np.longest': 'Most dedicated', 'np.span': '{a} to {b}',
    'np.failed': '{who} failed in {town}: {what}', 'np.foot': 'Click any line to jump to that moment in the replay.',
    'np.fails': '{n} failed', 'np.files': '{n} files', 'np.in': 'in', 'np.commit': 'commit', 'np.close': 'Close',

    'mb.waiting': '⏳ Waiting for you', 'mb.error': '⚠️ Error', 'mb.working': '⚒ Working', 'mb.idle': '💤 Idle',
    'mb.public': '🔒 public mode', 'mb.notify': '{who} in {town} is waiting for you',

    'ui.worldmap': 'World Map', 'ui.party': 'Party', 'ui.chat': 'Chat Log', 'ui.replay': '⏪ Replay',
    'ui.replay.title': 'Replay today (R)', 'ui.news.title': 'Today\'s newspaper', 'ui.party.title': 'Table view',
    'ui.connecting': 'Calling Kafra…', 'ui.play.title': 'Play / pause (Space)', 'ui.speed.title': 'Speed',
    'ui.day.title': 'Pick a day', 'ui.live.title': 'Back to now (Esc)', 'ui.lang.title': 'Bahasa Indonesia',

    'pw.title': 'Party Window', 'pw.adventurer': 'Adventurer', 'pw.job': 'Job', 'pw.context': 'Context', 'pw.status': 'Status',
    'pw.count': '{n} adventurers', 'pw.scanned': 'scanned {time}', 'pw.none': 'No sessions in the last 7 days.',
    'pw.casting': 'casting', 'pw.idle': 'idle', 'pw.resting': 'resting', 'pw.party': 'party member', 'pw.city': 'Kafra City ↗',
  },

  id: {
    'kind.build': 'membangun', 'kind.research': 'meneliti', 'kind.craft': 'meracik', 'kind.trial': 'uji coba',
    'kind.deliver': 'menyetor ke Kafra', 'kind.teleport': 'teleport', 'kind.summon': 'memanggil party',
    'kind.ask': 'bertanya padamu', 'kind.cast': 'berpikir', 'kind.waiting': 'menunggu giliranmu', 'kind.idle': 'idle', 'kind.resting': 'istirahat',

    'status.waiting': 'nunggu kamu', 'status.error': 'error', 'status.working': 'kerja', 'status.idle': 'idle',

    'ago.s': '{n} dtk lalu', 'ago.m': '{n} mnt lalu', 'ago.h': '{n} jam lalu', 'ago.d': '{n} hari lalu',

    wilds: 'Tanah Liar', 'no.repo': 'tanpa repo', 'towns.empty': 'Belum ada adventurer.',
    'mode.public': '🔒 publik', 'mode.public.title': 'Semua teks disembunyikan oleh server',
    census: '{active} aktif · {total} adventurer · {towns} kota',

    'head.kafra': 'Kafra Service', 'head.agent': 'Status Adventurer', 'head.building': 'Bangunan',
    'detail.hint': 'Klik adventurer, bangunan, atau Kafra di kota untuk melihat detail.',
    'lbl.quest': 'Quest', 'lbl.hp': 'HP', 'lbl.doing': 'Sedang', 'lbl.last': 'Terakhir', 'lbl.leader': 'Leader',
    'sub.party': 'Party', 'sub.prompt': 'Perintah terakhir', 'sub.reply': 'Ucapan terakhir', 'sub.activity': 'Aktivitas',
    'commits.none': 'Belum ada commit minggu ini.',
    'mood.bustling': 'ramai', 'mood.steady': 'tenang', 'mood.abandoned': 'terbengkalai: tidak ada commit 30 hari',
    'mood.short.bustling': 'ramai', 'mood.short.abandoned': 'terbengkalai',
    'lbl.history': 'Sejarah', 'history': '{files} file · {commits} commit', 'sub.next': 'Menuju {tier}',
    'lbl.file': 'File', 'lbl.commit': 'Commit', 'lbl.age': 'Umur', days: '{n} hari',
    'kafra.welcome': '“Selamat datang di Kafra! Ini catatan pembangunan kota {town}.”',
    'lbl.tier': 'Tingkat', 'lbl.region': 'Wilayah', 'lbl.folk': 'Warga', folk: '{n} adventurer, {busy} sedang bekerja',
    'lbl.buildings': 'Bangunan', buildings: '{files} file · {dirty} belum di-commit',
    'sub.adventurers': 'Adventurer', 'sub.districts': 'Distrik', 'district.files': '{n} file',
    'lines.week': '{n} baris/minggu', 'sub.buildlog': 'Build log (7 hari)',
    'lbl.size': 'Ukuran', 'lbl.construction': 'Konstruksi', 'construction.n': '🚧 {n} file belum di-commit', none: 'tidak ada',
    'lbl.week': 'Minggu ini', week: '{c} commit · {l} baris',
    'sub.builders': 'Sedang dibangun oleh', 'sub.visited': 'Pernah dikerjakan', 'sub.commits': 'Commit',
    'sub.here': 'Di sini sekarang', empty: 'kosong',

    'civic.library': 'Perpustakaan', 'civic.workshop': 'Bengkel', 'civic.inn': 'Penginapan', 'civic.arena': 'Arena Latihan',
    'civic.kafra': 'Kafra', 'civic.warp': 'Warp Portal',
    'civic.library.text': 'Agent yang membaca file atau mencari kode (Read, Grep, Glob) datang ke sini.',
    'civic.workshop.text': 'Agent yang menjalankan perintah shell meracik di sini. Cerobong berasap lebih tebal saat ada yang bekerja.',
    'civic.inn.text': 'Sesi yang sudah lebih dari 30 menit diam beristirahat di sini.',
    'civic.arena.text': 'Menjalankan test. Angka damage itu hiasan; "Miss" merah berarti tool-nya gagal.',
    'civic.kafra.text': 'Commit dan push disetor ke sini. Setiap commit baru memicu kembang api.',
    townhall: 'Balai Kota', 'district.n': 'Distrik {n}', 'kingdom.n': 'Kerajaan {n}', 'kingdom.of': 'Kerajaan {name}', 'towns.count': '{n} kota',

    'biome.coast': 'Pantai', 'biome.desert': 'Gurun', 'biome.plains': 'Padang', 'biome.snow': 'Pegunungan Salju',
    'biome.forest': 'Hutan', 'biome.meadow': 'Taman Bunga', 'biome.canyon': 'Ngarai',

    'log.tool': '{who} {kind}: {target}', 'log.error': '{who} gagal: {tool}', 'log.waiting': '{who} menunggu giliranmu.',
    'log.longrun': '{who} sudah {d} menjalankan {tool}', 'log.lowhp': '{who} HP tinggal {hp}%: context hampir penuh',
    'log.arrive': '{who} tiba di kota.', 'log.connected': 'Terhubung ke Kafra. Memantau semua adventurer (read-only).',
    'log.live': 'Kembali ke waktu sekarang.', 'log.replay': 'Replay {date} dimuat.',
    'conn.live': 'live', 'conn.lost': 'terputus, mencoba lagi',

    'party.asleep': '+{n} istirahat', 'party.none': 'Tidak ada adventurer yang bangun.',
    'tg.notify': 'notifikasi', 'tg.sound': 'suara', 'tg.music': 'musik', on: 'on',
    'bubble.waiting': 'Giliranmu!', 'bubble.thinking': 'berpikir…',

    'rb.loading': 'memuat…', 'rb.failed': 'gagal: {e}', 'rb.commit': 'commit', 'rb.fail': 'gagal',

    'np.title': 'Koran Kafra', 'np.quiet': 'Hari yang tenang. Tak satu adventurer pun bekerja.',
    'np.headline.commits': '{c} commit disetor di {t} kota', 'np.headline.none': '{n} adventurer bekerja tanpa commit',
    'np.lead.agents': '{n} adventurer bekerja di {t} kota', 'np.lead.actions': '{n} aksi', 'np.lead.files': '{n} file dibangun',
    'np.lead.fails': '{n} kegagalan', 'np.lead.fixed': ', {n} berhasil dibenahi', 'np.lead.clean': 'tanpa satu kegagalan pun',
    'np.highlights': 'Sorotan', 'np.best': 'Pembangun terbaik', 'np.longest': 'Paling tekun', 'np.span': '{a} sampai {b}',
    'np.failed': '{who} gagal di {town}: {what}', 'np.foot': 'Klik baris mana pun untuk melompat ke momen itu di replay.',
    'np.fails': '{n} gagal', 'np.files': '{n} file', 'np.in': 'di', 'np.commit': 'commit', 'np.close': 'Tutup',

    'mb.waiting': '⏳ Nunggu kamu', 'mb.error': '⚠️ Error', 'mb.working': '⚒ Kerja', 'mb.idle': '💤 Idle',
    'mb.public': '🔒 mode publik', 'mb.notify': '{who} di {town} menunggu giliranmu',

    'ui.worldmap': 'World Map', 'ui.party': 'Party', 'ui.chat': 'Chat Log', 'ui.replay': '⏪ Replay',
    'ui.replay.title': 'Putar ulang hari ini (R)', 'ui.news.title': 'Koran Kafra hari ini', 'ui.party.title': 'Tampilan tabel',
    'ui.connecting': 'Menghubungi Kafra…', 'ui.play.title': 'Putar / jeda (Spasi)', 'ui.speed.title': 'Kecepatan',
    'ui.day.title': 'Pilih hari', 'ui.live.title': 'Kembali ke sekarang (Esc)', 'ui.lang.title': 'English',

    'pw.title': 'Party Window', 'pw.adventurer': 'Adventurer', 'pw.job': 'Job', 'pw.context': 'Context', 'pw.status': 'Status',
    'pw.count': '{n} adventurer', 'pw.scanned': 'dipindai {time}', 'pw.none': 'Tidak ada sesi dalam 7 hari terakhir.',
    'pw.casting': 'casting', 'pw.idle': 'idle', 'pw.resting': 'istirahat', 'pw.party': 'party member', 'pw.city': 'Kafra City ↗',
  },
};

export const LANGS = Object.keys(STRINGS);
export const LOCALE = { en: 'en-GB', id: 'id-ID' };

/** A translator for one language; unknown keys fall back to English, then to the key itself. */
export function makeT(lang) {
  const table = STRINGS[lang] ?? STRINGS.en;
  return (key, vars = {}) => String(table[key] ?? STRINGS.en[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/** Map anything that looks like a locale to a supported language. */
export const normalise = (v) => (String(v ?? '').toLowerCase().startsWith('id') ? 'id' : String(v ?? '').toLowerCase().startsWith('en') ? 'en' : null);

/* ── The current language (one per process; the browser can switch it) ─── */

let current = 'en';
let explicit = false;
let translate = makeT(current);

/** Translate with the current language. */
export const t = (key, vars) => translate(key, vars);
export const lang = () => current;
export const locale = () => LOCALE[current];

export function setLang(next, { remember = false } = {}) {
  current = LANGS.includes(next) ? next : 'en';
  translate = makeT(current);
  if (remember) {
    explicit = true;
    try { globalThis.localStorage?.setItem('kafra.lang', current); } catch { /* private mode */ }
  }
}

/** Browser start-up: URL, then the remembered toggle, then the browser's language. */
export function initBrowserLang() {
  const fromUrl = normalise(new URLSearchParams(globalThis.location?.search ?? '').get('lang'));
  let stored = null;
  try { stored = normalise(globalThis.localStorage?.getItem('kafra.lang')); } catch { /* private mode */ }
  explicit = Boolean(fromUrl || stored);
  setLang(fromUrl ?? stored ?? normalise(globalThis.navigator?.language) ?? 'en');
}

/** The server says which language its user runs; follow it unless the viewer chose. */
export function adoptServerLang(serverLang) {
  if (explicit || !LANGS.includes(serverLang) || serverLang === current) return false;
  setLang(serverLang);
  return true;
}

/** Server start-up: KAFRA_LANG, then the shell's locale. */
export function serverLang(env = globalThis.process?.env ?? {}) {
  return normalise(env.KAFRA_LANG) ?? normalise(env.LC_ALL) ?? normalise(env.LANG) ?? 'en';
}

/** Fill every element marked data-i18n (text) or data-i18n-title (tooltip). */
export function applyStatic(root = globalThis.document) {
  if (!root) return;
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  root.documentElement.lang = current;
}

/** Label for a public-mode placeholder ("#3"), a root district, or a plain folder. */
export function districtName(name) {
  if (name === '(root)') return t('townhall');
  const n = String(name).match(/^#(\d+)$/);
  return n ? t('district.n', { n: n[1] }) : `${name}/`;
}
export function kingdomName(owner) {
  if (!owner) return t('wilds');
  const n = String(owner).match(/^#(\d+)$/);
  return n ? t('kingdom.n', { n: n[1] }) : owner;
}
