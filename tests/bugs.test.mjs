import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openBugs, failStreak, latestTest, bugOutcome } from '../web/city/bugs.js';

// Tools are newest first, as the server and replay send them.
const run = (id, error, extra = {}) => ({ id, kind: 'trial', done: true, error, label: 'Run tests', ...extra });
const edit = (id) => ({ id, kind: 'build', done: true, error: false });

test('a failed latest test run leaves a bug, sized by failures in a row', () => {
  const a = { id: 'a', tools: [run('3', true), edit('2'), run('1', true), run('0', false)] };
  assert.equal(failStreak(a), 2);
  const bugs = openBugs([a]);
  assert.equal(bugs.get('a').streak, 2);
  assert.equal(bugs.get('a').tool.id, '3');
});

test('a passing latest run means no bug, and slays the one that was there', () => {
  const a = { id: 'a', tools: [run('2', false), run('1', true)] };
  assert.equal(openBugs([a]).size, 0);
  assert.equal(bugOutcome(a), 'slain');
});

test('runs still in progress and other tools are ignored', () => {
  const a = { id: 'a', tools: [{ ...run('2', false), done: false }, { id: 'x', kind: 'build', done: true, error: true }, run('1', true)] };
  assert.equal(latestTest(a).id, '1');
  assert.equal(failStreak(a), 1);
});

test('a bug whose agent left, or whose failure scrolled out of history, flees', () => {
  assert.equal(bugOutcome(undefined), 'fled');
  assert.equal(bugOutcome({ id: 'a', tools: [edit('5')] }), 'fled');
  assert.equal(openBugs([{ id: 'b' }]).size, 0);
});
