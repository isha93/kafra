/**
 * Koran Kafra: one day on one page, written from the replay's data.
 *
 * Every number comes from the same timelines the replay plays, so a headline
 * can be clicked to jump the replay to that moment.
 */

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const basename = (p) => String(p ?? '').split('/').filter(Boolean).pop() ?? '';
const plural = (n, word) => `${n} ${word}`;

/** Numbers for the day, per town and per agent. */
export function summarise(data) {
  const towns = [];
  let files = 0, commits = 0, fails = 0, fixed = 0, tools = 0;
  const agents = [];

  for (const town of data.towns) {
    const t = { town, agents: [], commits: town.commits, built: new Set(), fails: 0 };
    for (const a of town.agents) {
      const events = data.timelines[a.id] ?? [];
      if (!events.length) continue;
      const results = new Map(events.filter((e) => e.type === 'result').map((e) => [e.id, e]));
      const s = { a, town, kinds: {}, built: new Set(), fails: [], recovered: 0, first: events[0].t, last: events.at(-1).t, prompts: 0 };
      let failing = false;
      for (const e of events) {
        if (e.type === 'prompt') s.prompts++;
        if (e.type !== 'tool') continue;
        s.kinds[e.kind] = (s.kinds[e.kind] ?? 0) + 1;
        if (e.kind === 'build' && (e.file || e.building)) s.built.add(e.file ?? e.building);
        const r = results.get(e.id);
        if (r?.error) { s.fails.push(e); failing = true; }
        // A failed test followed by a passing one is a fix.
        else if (r && failing && e.kind === 'trial') { s.recovered++; failing = false; }
      }
      const n = Object.values(s.kinds).reduce((x, y) => x + y, 0);
      tools += n;
      s.tools = n;
      for (const f of s.built) t.built.add(f);
      t.fails += s.fails.length;
      fails += s.fails.length;
      fixed += s.recovered;
      t.agents.push(s);
      agents.push(s);
    }
    files += t.built.size;
    commits += t.commits.length;
    towns.push(t);
  }
  towns.sort((x, y) => y.commits.length - x.commits.length || y.built.size - x.built.size);
  const mvp = [...agents].sort((x, y) => y.built.size - x.built.size || y.tools - x.tools)[0] ?? null;
  const longest = [...agents].sort((x, y) => (y.last - y.first) - (x.last - x.first))[0] ?? null;
  return { towns, agents, files, commits, fails, fixed, tools, mvp, longest };
}

const name = (a) => (a.isParty ? a.agentType ?? 'party' : a.job);
const KIND_WORD = { build: 'membangun', research: 'meneliti', craft: 'meracik', trial: 'uji coba', deliver: 'menyetor', teleport: 'teleport', summon: 'memanggil party', cast: 'merencanakan' };

/** A clickable line: jumps the replay to `t` and selects the agent if given. */
const moment = (t, text, agent) => `<li><a href="#" class="np-jump" data-t="${t}"${agent ? ` data-agent="${esc(agent)}"` : ''}><span class="np-t">${hhmm(t)}</span> ${text}</a></li>`;

export function renderNewspaper(data, el) {
  const s = summarise(data);
  const day = new Date(data.from).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (!s.agents.length) {
    el.innerHTML = `<h1>📰 Koran Kafra</h1><div class="np-date">${esc(day)}</div><p class="np-lead">Hari yang tenang. Tak satu adventurer pun bekerja.</p>`;
    return;
  }

  const headline = s.commits
    ? `${plural(s.commits, 'commit')} disetor di ${plural(s.towns.filter((t) => t.commits.length).length, 'kota')}`
    : `${plural(s.agents.length, 'adventurer')} bekerja tanpa commit`;
  const lead = [
    `${plural(s.agents.length, 'adventurer')} bekerja di ${plural(s.towns.filter((t) => t.agents.length).length, 'kota')}`,
    `${plural(s.tools, 'aksi')}`,
    `${plural(s.files, 'file')} dibangun`,
    s.fails ? `${plural(s.fails, 'kegagalan')}${s.fixed ? `, ${s.fixed} berhasil dibenahi` : ''}` : 'tanpa satu kegagalan pun',
  ].join(' · ');

  const sections = s.towns.filter((t) => t.agents.length || t.commits.length).map((t) => {
    const stars = '★'.repeat(t.town.tier?.stars ?? 1);
    const people = t.agents.map((a) => {
      const top = Object.entries(a.kinds).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k, n]) => `${KIND_WORD[k] ?? k} ×${n}`).join(', ');
      const built = [...a.built].slice(0, 3).map((f) => `<code>${esc(basename(f))}</code>`).join(' ');
      return moment(a.first, `<b>${esc(name(a.a))}</b> <span class="np-src">${esc(a.a.sourceName ?? '')}</span> — ${esc(top)}${built ? ` · ${built}` : ''}${a.fails.length ? ` · <span class="np-bad">${a.fails.length} gagal</span>` : ''}`, a.a.id);
    }).join('');
    const commits = t.commits.slice(0, 5).map((c) => moment(c.at, `🏆 ${esc(c.subject || 'commit')} <span class="np-muted">+${c.added} −${c.removed}</span>`)).join('');
    return `
      <section>
        <h2>${esc(t.town.town)} <span class="np-stars">${stars}</span> <span class="np-muted">${esc(t.town.name || '')}</span></h2>
        <ul>${people}${commits}</ul>
      </section>`;
  }).join('');

  const fails = s.agents.flatMap((a) => a.fails.map((e) => ({ e, a }))).sort((x, y) => x.e.t - y.e.t).slice(0, 5);
  const awards = [
    s.mvp && s.mvp.built.size ? moment(s.mvp.first, `🏅 <b>Pembangun terbaik:</b> ${esc(name(s.mvp.a))} di ${esc(s.mvp.town.town)} — ${plural(s.mvp.built.size, 'file')}`, s.mvp.a.id) : '',
    s.longest ? moment(s.longest.first, `⏳ <b>Paling tekun:</b> ${esc(name(s.longest.a))} — ${hhmm(s.longest.first)} sampai ${hhmm(s.longest.last)}`, s.longest.a.id) : '',
    ...fails.map(({ e, a }) => moment(e.t, `<span class="np-bad">✗</span> ${esc(name(a.a))} gagal di ${esc(a.town.town)}: ${esc(e.label || e.name)}`, a.a.id)),
  ].join('');

  el.innerHTML = `
    <div class="np-head"><h1>📰 Koran Kafra</h1><button class="np-close" type="button" aria-label="Tutup">✕</button></div>
    <div class="np-date">${esc(day)}</div>
    <div class="np-headline">${esc(headline)}</div>
    <p class="np-lead">${esc(lead)}</p>
    ${awards ? `<section><h2>Sorotan</h2><ul>${awards}</ul></section>` : ''}
    ${sections}
    <p class="np-foot">Klik baris mana pun untuk melompat ke momen itu di replay.</p>`;
}
