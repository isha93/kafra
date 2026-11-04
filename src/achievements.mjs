/**
 * Achievements: one list for your whole world, unlocked once and kept.
 *
 * Each test reads a few numbers: running totals the EXP book keeps (exp.mjs)
 * and what the world looks like right now. Names and descriptions live in the
 * client's i18n (`ach.<id>`), icons in web/city/ui.js.
 */
export const ACHIEVEMENTS = [
  { id: 'first-blood', test: (s) => s.slain >= 1 },
  { id: 'exterminator', test: (s) => s.slain >= 10 },
  { id: 'bug-hunter', test: (s) => s.slain >= 50 },
  { id: 'green-streak', test: (s) => s.bestStreak >= 5 },
  { id: 'architect', test: (s) => s.built >= 100 },
  { id: 'veteran', test: (s) => s.maxLevel >= 10 },
  { id: 'hero', test: (s) => s.maxLevel >= 30 },
  { id: 'full-party', test: (s) => s.maxParty >= 3 },
  { id: 'busy-guild', test: (s) => s.active >= 3 },
  { id: 'multiclass', test: (s) => s.sources >= 2 },
  { id: 'kingdom', test: (s) => s.towns >= 5 },
  { id: 'city-builder', test: (s) => s.maxStars >= 4 },
  { id: 'capital', test: (s) => s.maxStars >= 5 },
  { id: 'night-owl', test: (s) => s.night >= 1 },
];

/** What the world looks like right now, for the tests above. */
export function worldStats(towns) {
  const agents = towns.flatMap((t) => t.agents);
  const party = new Map();
  for (const a of agents) if (a.leader) party.set(a.leader, (party.get(a.leader) ?? 0) + 1);
  return {
    towns: towns.filter((t) => t.root).length,
    maxStars: Math.max(0, ...towns.map((t) => t.tier?.stars ?? 0)),
    active: agents.filter((a) => a.status === 'active').length,
    maxParty: Math.max(0, ...party.values()),
    sources: new Set(agents.map((a) => a.source).filter(Boolean)).size,
  };
}

/** Ids whose test passes and that aren't unlocked yet. */
export function newlyUnlocked(stats, unlocked) {
  return ACHIEVEMENTS.filter((a) => !unlocked[a.id] && a.test(stats)).map((a) => a.id);
}
