/**
 * Kafra's online demo: there is no server on GitHub Pages, so this classic
 * script (loaded before the city's modules) plays back a recording of
 * `npm run simulate` in place of the live API.
 *
 *   EventSource('api/world/stream') → the recorded world frames, on a loop
 *   EventSource('api/stream')       → the recorded party window frames
 *   fetch('api/replay?…')            → the recorded replay of that run
 *
 * Every timestamp in a frame is moved so the recording happens "now": the
 * first frame of each loop is stamped with the moment it plays. Nothing is
 * sent anywhere; the recording is fake agents in fake repos.
 */
(() => {
  const realFetch = window.fetch.bind(window);
  const RealEventSource = window.EventSource;
  const recording = realFetch('demo/recording.json').then((r) => {
    if (!r.ok) throw new Error(`recording: HTTP ${r.status}`);
    return r.json();
  });
  const pageStart = Date.now();

  const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/;
  // Epoch milliseconds between 2001 and 2286; token counts and sizes stay far below.
  const isEpochMs = (n) => Number.isInteger(n) && n >= 1e12 && n < 1e13;

  /** A copy of `value` with every timestamp moved by `by` ms. */
  function shift(value, by) {
    if (typeof value === 'string') return ISO.test(value) ? new Date(Date.parse(value) + by).toISOString() : value;
    if (typeof value === 'number') return isEpochMs(value) ? value + by : value;
    if (Array.isArray(value)) return value.map((v) => shift(v, by));
    if (value && typeof value === 'object') {
      const out = {};
      for (const k in value) out[k] = shift(value[k], by);
      return out;
    }
    return value;
  }

  class DemoEventSource extends EventTarget {
    constructor(url) {
      super();
      this.url = String(url);
      this.readyState = 0;
      this.onopen = this.onmessage = this.onerror = null;
      this.timer = null;
      const track = this.url.includes('world/stream') ? 'world' : 'party';
      recording.then((rec) => this.play(rec, rec[track] ?? []), (err) => {
        console.warn('kafra demo:', err);
        this.emit('error', new Event('error'));
      });
    }

    emit(type, event) {
      this.dispatchEvent(event);
      this['on' + type]?.(event);
    }

    play(rec, frames) {
      if (this.readyState === 2 || !frames.length) return;
      this.readyState = 1;
      this.emit('open', new Event('open'));
      const length = Math.max(rec.end - rec.start, 1000);
      const step = (loop, i) => {
        if (this.readyState === 2) return;
        if (i >= frames.length) return step(loop + 1, 0);
        const loopStart = pageStart + loop * length;
        const due = loopStart + frames[i].t;
        this.timer = setTimeout(() => {
          const data = JSON.stringify(shift(frames[i].d, loopStart - rec.start));
          this.emit('message', new MessageEvent('message', { data }));
          step(loop, i + 1);
        }, Math.max(0, due - Date.now()));
      };
      step(Math.floor((Date.now() - pageStart) / length), 0);
    }

    close() {
      this.readyState = 2;
      clearTimeout(this.timer);
    }
  }
  DemoEventSource.CONNECTING = 0;
  DemoEventSource.OPEN = 1;
  DemoEventSource.CLOSED = 2;

  window.EventSource = function EventSource(url, init) {
    return /(^|\/)api\//.test(String(url)) ? new DemoEventSource(url) : new RealEventSource(url, init);
  };

  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    if (!/(^|\/)api\/replay/.test(url)) return realFetch(input, init);
    const rec = await recording;
    // The recorded run ends at the end of the day asked for, or now for today.
    const to = Number(new URL(url, location.href).searchParams.get('to')) || Date.now();
    const body = JSON.stringify(shift(rec.replay, Math.min(to, Date.now()) - rec.end));
    return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  };

  /* ── A small ribbon saying what this is, and how to get your own ──────── */

  const id = (navigator.language || '').toLowerCase().startsWith('id');
  const text = id
    ? { what: 'Demo langsung · agent simulasi', how: 'Pakai dengan agent-mu sendiri' }
    : { what: 'Live demo · simulated agents', how: 'Run it with your own agents' };

  function ribbon() {
    const style = document.createElement('style');
    style.textContent = `
      .kafra-demo { position: fixed; top: 8px; left: 50%; transform: translateX(-50%); z-index: 9999;
        display: flex; gap: 10px; align-items: center; max-width: calc(100vw - 32px);
        padding: 5px 12px; border-radius: 999px; font: 12px/1.3 system-ui, sans-serif;
        background: rgba(20, 24, 48, .86); color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.35); }
      .kafra-demo a { color: #ffd76a; font-weight: 600; text-decoration: none; white-space: nowrap; }
      .kafra-demo a:hover { text-decoration: underline; }
      .kafra-demo button { all: unset; cursor: pointer; opacity: .7; padding: 0 2px; }
      @media (max-width: 520px) { .kafra-demo .what { display: none; } }`;
    const bar = document.createElement('div');
    bar.className = 'kafra-demo';
    bar.innerHTML = `<span class="what">🎮 ${text.what}</span>
      <a href="https://github.com/isha93/kafra#readme" target="_blank" rel="noopener">${text.how} →</a>
      <button type="button" aria-label="close">✕</button>`;
    bar.querySelector('button').onclick = () => bar.remove();
    document.head.append(style);
    document.body.append(bar);
  }
  if (document.body) ribbon();
  else document.addEventListener('DOMContentLoaded', ribbon);
})();
