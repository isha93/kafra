import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentAt, worldAt } from '../web/city/replay.js';
import { summarise } from '../web/city/newspaper.js';

const T0 = Date.parse('2026-11-03T10:00:00Z');
const at = (s) => T0 + s * 1000;
const meta = { id: 'a1', job: 'Lord Knight', sprite: 'knight' };
const events = [
  { t: at(0), type: 'prompt', text: 'fix the crash' },
  { t: at(5), type: 'tool', id: 'r1', name: 'Read', kind: 'research', file: 'src/a.ts' },
  { t: at(6), type: 'result', id: 'r1', error: false },
  { t: at(10), type: 'tool', id: 'e1', name: 'Edit', kind: 'build', file: 'src/a.ts', building: 'src' },
  { t: at(11), type: 'result', id: 'e1', error: false },
  { t: at(20), type: 'tool', id: 'b1', name: 'Bash', kind: 'trial', label: 'npm test' },
  { t: at(25), type: 'result', id: 'b1', error: true },
  { t: at(40), type: 'tool', id: 'b2', name: 'Bash', kind: 'trial', label: 'npm test' },
  { t: at(45), type: 'result', id: 'b2', error: false },
  { t: at(50), type: 'hp', hp: 72 },
  { t: at(60), type: 'end', text: 'Fixed, tests pass.' },
];

test('before its first event an agent is not there yet', () => {
  assert.equal(agentAt(meta, events, at(-1)), null);
});

test('just after a prompt the agent is thinking', () => {
  assert.equal(agentAt(meta, events, at(1)).kind, 'cast');
});

test('during and right after an edit it builds at the right district', () => {
  const a = agentAt(meta, events, at(10));
  assert.equal(a.kind, 'build');
  assert.equal(a.building, 'src');
  assert.equal(agentAt(meta, events, at(15)).kind, 'build');
});

test('a running test is training, and a failed one is an error on the latest tool', () => {
  assert.equal(agentAt(meta, events, at(22)).kind, 'trial');
  assert.equal(agentAt(meta, events, at(30)).tools[0].error, true);
});

test('after the turn ends it waits for you, then idles, then rests', () => {
  assert.equal(agentAt(meta, events, at(61)).kind, 'waiting');
  assert.equal(agentAt(meta, events, at(61)).hp, 72);
  assert.equal(agentAt(meta, events, at(61 + 40 * 60)).kind, 'resting');
});

test('worldAt keeps commits up to t and drops towns with nobody and nothing yet', () => {
  const data = {
    from: T0, to: at(3600),
    towns: [
      { id: 'x', town: 'Payon', agents: [meta], commits: [{ hash: 'c1', at: at(55) }], districts: [] },
      { id: 'y', town: 'Geffen', agents: [{ id: 'late' }], commits: [], districts: [] },
    ],
    timelines: { a1: events, late: [{ t: at(3000), type: 'prompt' }] },
  };
  const w = worldAt(data, at(50));
  assert.deepEqual(w.towns.map((t) => t.town), ['Payon']);
  assert.equal(w.towns[0].commits.length, 0);
  assert.equal(worldAt(data, at(56)).towns[0].commits.length, 1);
});

test('the newspaper counts builds, failures and fixes', () => {
  const s = summarise({
    from: T0, to: at(3600),
    towns: [{ id: 'x', town: 'Payon', tier: { stars: 2 }, agents: [meta], commits: [{ at: at(55), subject: 'fix', added: 3, removed: 1 }], districts: [] }],
    timelines: { a1: events },
  });
  assert.equal(s.commits, 1);
  assert.equal(s.files, 1);
  assert.equal(s.fails, 1);
  assert.equal(s.fixed, 1);
  assert.equal(s.mvp.a.id, 'a1');
});
