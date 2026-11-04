/**
 * Wake the live streams when an agent writes, instead of rebuilding every 2 s.
 *
 * Session folders are watched recursively and every write bumps a counter.
 * A quiet world is still rebuilt every HEARTBEAT_MS, because some states change
 * with time alone (a working agent turns idle after 90 s) and git isn't
 * watched. If no folder can be watched, streams fall back to polling.
 */
import { watch, existsSync } from 'node:fs';

export const POLL_MS = 2000;
const HEARTBEAT_MS = 10_000;

let version = 0;
let watching = 0;
const waiters = new Set();

function bump() {
  version++;
  for (const wake of waiters) wake();
  waiters.clear();
}

/** Watch these folders (missing ones are skipped); returns how many are watched. */
export function startWatching(dirs) {
  for (const dir of new Set(dirs)) {
    if (!dir || !existsSync(dir)) continue;
    try {
      const w = watch(dir, { recursive: true, persistent: false }, bump);
      w.on('error', () => { w.close(); watching--; });
      watching++;
    } catch { /* unsupported here: polling covers it */ }
  }
  return watching;
}

/** The change counter, to pass back to nextChange(). */
export const changeVersion = () => version;

/**
 * Resolves on the first write after `since`, or right away if one already
 * happened; otherwise after the heartbeat (or the poll interval, unwatched).
 */
export function nextChange(since) {
  if (version !== since) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); waiters.delete(done); resolve(); };
    const timer = setTimeout(done, watching > 0 ? HEARTBEAT_MS : POLL_MS);
    waiters.add(done);
  });
}
