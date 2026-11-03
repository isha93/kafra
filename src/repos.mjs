import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { relative, isAbsolute, basename } from 'node:path';
import { tierOf, moodOf, biomeOf } from './growth.mjs';

const run = promisify(execFile);

/**
 * Read-only git, safe to run next to an agent that is committing.
 *
 * - execFile, never a shell: a cwd or branch name can never become a command.
 * - GIT_OPTIONAL_LOCKS=0: `git status` normally refreshes the index and takes
 *   index.lock to do it. With an agent committing in the same repo that is a
 *   real "index.lock exists" failure on *their* side. This turns it off.
 * - core.fsmonitor=false: a repo-configured fsmonitor is an arbitrary program;
 *   viewing a repo should never start one.
 * - GIT_TERMINAL_PROMPT=0: nothing here talks to a remote, and nothing may block
 *   waiting for credentials if that ever changes.
 * - --no-ext-diff --no-textconv on log: a repo's diff driver config names a
 *   program to run; reading stats must never launch one.
 */
const GIT_ENV = {
  ...process.env,
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  LC_ALL: 'C',
};

async function git(cwd, args) {
  const { stdout } = await run(
    'git',
    ['-c', 'core.fsmonitor=false', '-c', 'core.quotepath=off', '-C', cwd, ...args],
    { env: GIT_ENV, timeout: 5000, maxBuffer: 16 * 1024 * 1024 },
  );
  return stdout;
}

/** Stats are recomputed at most this often per repo, whatever the poll rate is. */
const STATS_TTL_MS = 10_000;
/** Buildings per town. More than this and a town stops being readable. */
const MAX_DISTRICTS = 8;

const rootCache = new Map();   // cwd → Promise<root | null>
const statsCache = new Map();  // root → { at, promise }
const lastGood = new Map();    // root → last growth numbers read without a git error

/** The repo a working directory belongs to, or null outside git. Cached forever: repos don't move. */
export function repoRootOf(cwd) {
  if (!rootCache.has(cwd)) {
    rootCache.set(cwd, git(cwd, ['rev-parse', '--show-toplevel']).then((s) => s.trim() || null, () => null));
  }
  return rootCache.get(cwd);
}

/** "owner/repo" from a GitHub-style remote URL, or the folder name. */
function repoName(remoteUrl, root) {
  const m = remoteUrl.trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? { owner: m[1], name: m[2] } : { owner: '', name: basename(root) };
}

/** First path segment of a repo-relative path; files at the root share one building. */
export function districtOf(relPath) {
  const i = relPath.indexOf('/');
  return i === -1 ? '(root)' : relPath.slice(0, i);
}

/** Absolute or relative file path → district inside root, or null if it lives elsewhere. */
export function districtOfFile(root, file) {
  if (!file) return null;
  const rel = isAbsolute(file) ? relative(root, file) : file;
  if (!rel || rel.startsWith('..')) return null;
  return districtOf(rel);
}

async function computeStats(root) {
  const [remote, branch, files, log, status, total, recent, roots, last] = await Promise.all([
    git(root, ['remote', 'get-url', 'origin']).catch(() => ''),
    git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => ''),
    git(root, ['ls-files']).catch(() => ''),
    git(root, ['log', '--since=7.days.ago', '--no-merges', '--no-ext-diff', '--no-textconv', '--numstat', '--pretty=format:%x00%h%x09%at%x09%an%x09%s']).catch(() => ''),
    git(root, ['status', '--porcelain=v1']).catch(() => ''),
    // null on failure, not 0: see `steady` below.
    git(root, ['rev-list', '--count', 'HEAD']).catch(() => null),
    git(root, ['rev-list', '--count', '--since=30.days.ago', 'HEAD']).catch(() => null),
    // Root commits; a repo can have several, the oldest is the town's founding.
    git(root, ['log', '--max-parents=0', '--format=%at', 'HEAD']).catch(() => null),
    git(root, ['log', '-1', '--format=%at', 'HEAD']).catch(() => null),
  ]);
  const paths = files.split('\n').filter(Boolean);
  // A git call can fail for a moment while an agent is committing (refs being
  // rewritten). Falling back to zero would demote a capital to a camp for ten
  // seconds; the last good reading is the honest answer.
  const prev = lastGood.get(root);
  const steady = (raw, parse, key) => (raw === null ? prev?.[key] ?? null : parse(raw));
  const firstOf = (raw) => {
    const t = Math.min(...raw.split('\n').filter(Boolean).map((x) => Number(x) * 1000));
    return Number.isFinite(t) ? t : null;
  };
  const growth = {
    files: paths.length,
    commitsTotal: steady(total, (x) => Number(x.trim()) || 0, 'commitsTotal') ?? 0,
    commits30: steady(recent, (x) => Number(x.trim()) || 0, 'commits30') ?? 0,
    firstCommitAt: steady(roots, firstOf, 'firstCommitAt'),
    lastCommitAt: steady(last, (x) => Number(x.trim()) * 1000 || null, 'lastCommitAt'),
  };
  if ([total, recent, roots, last].every((x) => x !== null)) lastGood.set(root, growth);

  const districts = new Map();
  const district = (name) => {
    if (!districts.has(name)) districts.set(name, { name, files: 0, churn: 0, commits: 0, dirty: 0 });
    return districts.get(name);
  };

  for (const f of files.split('\n')) if (f) district(districtOf(f)).files++;

  const commits = [];
  for (const chunk of log.split('\0')) {
    const [head, ...rest] = chunk.split('\n');
    if (!head) continue;
    const [hash, at, author, subject] = head.split('\t');
    const touched = new Set();
    let added = 0;
    let removed = 0;
    for (const line of rest) {
      const [a, r, path] = line.split('\t');
      if (!path) continue;
      const d = districtOf(path.replace(/\{.*? => (.*?)\}/, '$1'));
      const n = (Number(a) || 0) + (Number(r) || 0);
      added += Number(a) || 0;
      removed += Number(r) || 0;
      district(d).churn += n;
      touched.add(d);
    }
    for (const d of touched) district(d).commits++;
    commits.push({ hash, at: Number(at) * 1000, author, subject, added, removed, districts: [...touched] });
  }

  for (const line of status.split('\n')) {
    if (line.length < 4) continue;
    const path = line.slice(3).split(' -> ').pop().replace(/^"|"$/g, '');
    district(districtOf(path)).dirty++;
  }

  // Keep the busiest districts, and always the root building as the town's fallback.
  const ranked = [...districts.values()].sort(
    (a, b) => (b.churn + b.dirty * 50) - (a.churn + a.dirty * 50) || b.files - a.files,
  );
  const kept = ranked.slice(0, MAX_DISTRICTS);
  if (ranked.length > MAX_DISTRICTS && !kept.some((d) => d.name === '(root)')) {
    kept[kept.length - 1] = district('(root)');
  }

  return {
    root,
    ...repoName(remote, root),
    branch: branch.trim(),
    districts: kept.sort((a, b) => a.name.localeCompare(b.name)),
    commits: commits.slice(0, 30),
    growth,
    tier: tierOf(growth),
    mood: moodOf(growth),
    biome: biomeOf(paths),
    totals: {
      files: paths.length,
      commitsWeek: commits.length,
      dirty: status.split('\n').filter(Boolean).length,
    },
  };
}

/** Commits between two instants, newest first, for replays of older days. */
export async function commitsBetween(root, from, to) {
  const log = await git(root, [
    'log', `--since=${new Date(from).toISOString()}`, `--until=${new Date(to).toISOString()}`,
    '--no-merges', '--no-ext-diff', '--no-textconv', '--numstat', '--pretty=format:%x00%h%x09%at%x09%an%x09%s',
  ]).catch(() => '');
  const out = [];
  for (const chunk of log.split('\0')) {
    const [head, ...rest] = chunk.split('\n');
    if (!head) continue;
    const [hash, at, author, subject] = head.split('\t');
    const touched = new Set();
    let added = 0, removed = 0;
    for (const line of rest) {
      const [a, r, path] = line.split('\t');
      if (!path) continue;
      added += Number(a) || 0;
      removed += Number(r) || 0;
      touched.add(districtOf(path.replace(/\{.*? => (.*?)\}/, '$1')));
    }
    out.push({ hash, at: Number(at) * 1000, author, subject, added, removed, districts: [...touched] });
  }
  return out.slice(0, 200);
}

/**
 * Town stats for a repo, cached.
 *
 * Concurrent callers share one in-flight computation, so several SSE clients
 * polling every 2s still cost one set of git calls per repo per TTL.
 */
export function repoStats(root) {
  const hit = statsCache.get(root);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.promise;
  const promise = computeStats(root).catch((err) => ({ root, error: String(err.message ?? err) }));
  statsCache.set(root, { at: Date.now(), promise });
  return promise;
}
