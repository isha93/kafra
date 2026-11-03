/**
 * How developed a town is, and what land it stands on.
 *
 * Pure functions over repo numbers, so the thresholds are easy to test and
 * tune. The client draws whatever these return; it never reads git itself.
 */

/** Tiers in order. `cap` is the tallest district building the tier may show. */
export const TIERS = [
  { id: 'camp', name: 'Camp', stars: 1, cap: 1 },
  { id: 'village', name: 'Village', stars: 2, cap: 2 },
  { id: 'town', name: 'Town', stars: 3, cap: 4 },
  { id: 'city', name: 'City', stars: 4, cap: 5 },
  { id: 'capital', name: 'Capital', stars: 5, cap: 5 },
];

/**
 * Size is the main ladder: tracked files, with commit count as a floor so a
 * huge vendored import with three commits doesn't become a capital overnight.
 * Capital also needs age: half a year of history.
 */
const LADDER = [
  { tier: 'village', files: 25, commits: 10 },
  { tier: 'town', files: 120, commits: 40 },
  { tier: 'city', files: 500, commits: 150 },
  { tier: 'capital', files: 2000, commits: 500, days: 180 },
];

const DAY = 86_400_000;

export function tierOf({ files = 0, commitsTotal = 0, firstCommitAt = null }, now = Date.now()) {
  const ageDays = firstCommitAt ? (now - firstCommitAt) / DAY : 0;
  let index = 0;
  for (const [i, step] of LADDER.entries()) {
    if (files >= step.files && commitsTotal >= step.commits && ageDays >= (step.days ?? 0)) index = i + 1;
  }
  const next = LADDER[index] ?? null;
  return {
    ...TIERS[index],
    // What it takes to grow, for the Kafra panel.
    next: next && { name: TIERS[index + 1].name, files: next.files, commits: next.commits, days: next.days ?? 0 },
  };
}

/** Busy, quiet or abandoned, from commit recency. A repo with no commits yet is being founded, not abandoned. */
export function moodOf({ commits30 = 0, lastCommitAt = null }, now = Date.now()) {
  if (!lastCommitAt) return 'steady';
  if (now - lastCommitAt > 30 * DAY) return 'abandoned';
  if (commits30 >= 30) return 'bustling';
  return 'steady';
}

/** File extension → language family → biome. Unknown files don't vote. */
const FAMILY = {
  swift: 'swift', kt: 'swift', m: 'swift', mm: 'swift',
  ts: 'ts', tsx: 'ts', vue: 'ts', svelte: 'ts',
  js: 'web', jsx: 'web', mjs: 'web', cjs: 'web', html: 'web', css: 'web', scss: 'web',
  go: 'systems', rs: 'systems', c: 'systems', h: 'systems', cpp: 'systems', zig: 'systems',
  py: 'python', ipynb: 'python', r: 'python',
  rb: 'backend', php: 'backend', java: 'backend', cs: 'backend', ex: 'backend', exs: 'backend',
  md: 'docs', mdx: 'docs', rst: 'docs', txt: 'docs',
};

export const BIOMES = {
  // Display names live in the client's i18n (`biome.<id>`); these are for logs and the API.
  coast: { name: 'Coast', languages: 'Swift / Kotlin' },
  desert: { name: 'Desert', languages: 'TypeScript' },
  plains: { name: 'Plains', languages: 'JavaScript / Web' },
  snow: { name: 'Snowy peaks', languages: 'Go / Rust / C' },
  forest: { name: 'Forest', languages: 'Python' },
  meadow: { name: 'Flower meadow', languages: 'Docs' },
  canyon: { name: 'Canyon', languages: 'Ruby / PHP / Java' },
};

const BIOME_OF = { swift: 'coast', ts: 'desert', web: 'plains', systems: 'snow', python: 'forest', docs: 'meadow', backend: 'canyon' };

/** Count tracked files by language family; the biggest family picks the biome. */
export function biomeOf(paths) {
  const counts = {};
  for (const p of paths) {
    const ext = p.slice(p.lastIndexOf('.') + 1).toLowerCase();
    const family = p.includes('.') ? FAMILY[ext] : null;
    if (family) counts[family] = (counts[family] ?? 0) + 1;
  }
  // Docs only win when there is no code at all.
  const code = Object.entries(counts).filter(([f]) => f !== 'docs').sort((a, b) => b[1] - a[1]);
  const family = code[0]?.[0] ?? (counts.docs ? 'docs' : 'web');
  return { id: BIOME_OF[family], family, ...BIOMES[BIOME_OF[family]] };
}
