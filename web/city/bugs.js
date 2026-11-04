/**
 * Failing tests as bugs in the arena: which agents have one, and how big it is.
 *
 * Read from each agent's recent tools only, so a live snapshot and a replay
 * frame give the same answer. An agent's bug lives while its latest finished
 * test run failed, grows with each failure in a row, and is slain by the next
 * run that passes.
 */

/** Finished test runs, newest first. */
const tests = (a) => (a.tools ?? []).filter((t) => t.kind === 'trial' && t.done);

/** The newest finished test run, or null. */
export const latestTest = (a) => tests(a)[0] ?? null;

/** Failures in a row, counted back from the newest finished test run. */
export function failStreak(a) {
  let n = 0;
  for (const t of tests(a)) {
    if (!t.error) break;
    n++;
  }
  return n;
}

/** agent id → { agent, tool, streak } for every agent whose latest test run failed. */
export function openBugs(agents) {
  const bugs = new Map();
  for (const a of agents) {
    const streak = failStreak(a);
    if (streak) bugs.set(a.id, { agent: a, tool: latestTest(a), streak });
  }
  return bugs;
}

/** Why a bug left: slain by a passing test run, or gone with its agent's history. */
export function bugOutcome(agent) {
  const t = agent && latestTest(agent);
  return t && !t.error ? 'slain' : 'fled';
}
