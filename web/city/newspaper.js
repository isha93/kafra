/**
 * Koran Kafra: one day on one page, written from the replay's data.
 *
 * Every number comes from the same timelines the replay plays, so a headline
 * can be clicked to jump the replay to that moment.
 */

import { t, locale } from './i18n.js';

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const basename = (p) => String(p ?? '').split('/').filter(Boolean).pop() ?? '';

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
const kindWord = (k) => t(`kind.${k}`);

/** A clickable line: jumps the replay to `t` and selects the agent if given. */
const moment = (t, text, agent) => `<li><a href="#" class="np-jump" data-t="${t}"${agent ? ` data-agent="${esc(agent)}"` : ''}><span class="np-t">${hhmm(t)}</span> ${text}</a></li>`;

export function renderNewspaper(data, el) {
  const s = summarise(data);
  const day = new Date(data.from).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const head = `<div class="np-head"><h1>📰 ${esc(t('np.title'))}</h1><button class="np-close" type="button" aria-label="${esc(t('np.close'))}">✕</button></div>`;

  if (!s.agents.length) {
    el.innerHTML = `${head}<div class="np-date">${esc(day)}</div><p class="np-lead">${esc(t('np.quiet'))}</p>`;
    return;
  }

  const busyTowns = s.towns.filter((x) => x.agents.length).length;
  const commitTowns = s.towns.filter((x) => x.commits.length).length;
  const headline = s.commits
    ? t('np.headline.commits', { c: s.commits, t: commitTowns })
    : t('np.headline.none', { n: s.agents.length });
  const lead = [
    t('np.lead.agents', { n: s.agents.length, t: busyTowns }),
    t('np.lead.actions', { n: s.tools }),
    t('np.lead.files', { n: s.files }),
    s.fails ? t('np.lead.fails', { n: s.fails }) + (s.fixed ? t('np.lead.fixed', { n: s.fixed }) : '') : t('np.lead.clean'),
  ].join(' · ');

  const sections = s.towns.filter((x) => x.agents.length || x.commits.length).map((x) => {
    const stars = '★'.repeat(x.town.tier?.stars ?? 1);
    const people = x.agents.map((a) => {
      const top = Object.entries(a.kinds).sort((p, q) => q[1] - p[1]).slice(0, 2).map(([k, n]) => `${kindWord(k)} ×${n}`).join(', ');
      const built = [...a.built].slice(0, 3).map((f) => `<code>${esc(basename(f))}</code>`).join(' ');
      return moment(a.first, `<b>${esc(name(a.a))}</b> <span class="np-src">${esc(a.a.sourceName ?? '')}</span> — ${esc(top)}${built ? ` · ${built}` : ''}${a.fails.length ? ` · <span class="np-bad">${esc(t('np.fails', { n: a.fails.length }))}</span>` : ''}`, a.a.id);
    }).join('');
    const commits = x.commits.slice(0, 5).map((c) => moment(c.at, `🏆 ${esc(c.subject || t('np.commit'))} <span class="np-muted">+${c.added} −${c.removed}</span>`)).join('');
    return `
      <section>
        <h2>${esc(x.town.town)} <span class="np-stars">${stars}</span> <span class="np-muted">${esc(x.town.name || '')}</span></h2>
        <ul>${people}${commits}</ul>
      </section>`;
  }).join('');

  const fails = s.agents.flatMap((a) => a.fails.map((e) => ({ e, a }))).sort((p, q) => p.e.t - q.e.t).slice(0, 5);
  const awards = [
    s.mvp && s.mvp.built.size ? moment(s.mvp.first, `🏅 <b>${esc(t('np.best'))}:</b> ${esc(name(s.mvp.a))} ${esc(t('np.in'))} ${esc(s.mvp.town.town)} — ${esc(t('np.files', { n: s.mvp.built.size }))}`, s.mvp.a.id) : '',
    s.longest ? moment(s.longest.first, `⏳ <b>${esc(t('np.longest'))}:</b> ${esc(name(s.longest.a))} — ${esc(t('np.span', { a: hhmm(s.longest.first), b: hhmm(s.longest.last) }))}`, s.longest.a.id) : '',
    ...fails.map(({ e, a }) => moment(e.t, `<span class="np-bad">✗</span> ${esc(t('np.failed', { who: name(a.a), town: a.town.town, what: e.label || e.name }))}`, a.a.id)),
  ].join('');

  el.innerHTML = `
    ${head}
    <div class="np-date">${esc(day)}</div>
    <div class="np-headline">${esc(headline)}</div>
    <p class="np-lead">${esc(lead)}</p>
    ${awards ? `<section><h2>${esc(t('np.highlights'))}</h2><ul>${awards}</ul></section>` : ''}
    ${sections}
    <p class="np-foot">${esc(t('np.foot'))}</p>`;
}
