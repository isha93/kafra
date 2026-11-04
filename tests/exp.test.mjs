import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExpBook, levelOf, expFor, expOf, EXP } from '../src/exp.mjs';

const tmpFile = () => join(mkdtempSync(join(tmpdir(), 'kafra-test-exp-')), 'exp.json');
// Tools are newest first, as every source reports them.
const tool = (id, kind, { done = true, error = false } = {}) => ({ id, kind, done, error });
const town = (agents) => ({ id: '/repo', root: '/repo', agents });
const agent = (id, tools, sprite = 'knight') => ({ id, sprite, job: 'Lord Knight', tools });

test('levels climb on a curve and stop at 99', () => {
  assert.equal(levelOf(0).level, 1);
  assert.equal(levelOf(expFor(2) - 1).level, 1);
  assert.equal(levelOf(expFor(2)).level, 2);
  const mid = levelOf(expFor(10) + 5);
  assert.equal(mid.level, 10);
  assert.equal(mid.into, 5);
  assert.equal(mid.need, expFor(11) - expFor(10));
  assert.equal(levelOf(1e9).level, 99);
  assert.equal(levelOf(1e9).need, 0);
});

test('EXP by what a tool did; failures earn nothing; a fix slays the bug', () => {
  assert.equal(expOf(tool('a', 'research'), false), EXP.tool);
  assert.equal(expOf(tool('a', 'build'), false), EXP.build);
  assert.equal(expOf(tool('a', 'trial'), false), EXP.trial);
  assert.equal(expOf(tool('a', 'trial'), true), EXP.trial + EXP.slain);
  assert.equal(expOf(tool('a', 'build', { error: true }), false), 0);
});

test('each finished tool counts once, however often the world is scanned', () => {
  const book = new ExpBook(tmpFile());
  const a = agent('s1', [tool('2', 'build', { done: false }), tool('1', 'research')]);
  book.observe([town([a])]);
  book.observe([town([a])]);
  assert.equal(a.level.exp, EXP.tool);
  // The build finishes on a later scan.
  a.tools[0].done = true;
  book.observe([town([a])]);
  assert.equal(a.level.exp, EXP.tool + EXP.build);
});

test('sessions of one class in one town share an adventurer; a fixed test is a slain bug', () => {
  const book = new ExpBook(tmpFile());
  const s1 = agent('s1', [tool('b', 'trial'), tool('a', 'trial', { error: true })]);
  const s2 = agent('s2', [tool('c', 'build')]);
  const other = agent('s3', [tool('d', 'build')], 'assassin');
  book.observe([town([s1, s2, other])]);
  assert.equal(s2.level.exp, EXP.trial + EXP.slain + EXP.build);
  assert.equal(s2.level.slain, 1);
  assert.equal(other.level.exp, EXP.build);
});

test('EXP and counted tools survive a restart', () => {
  const file = tmpFile();
  const book = new ExpBook(file);
  book.observe([town([agent('s1', [tool('1', 'build')])])]);
  book.save();
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).adventurers['/repo|knight'].exp, EXP.build);
  // A new Kafra sees the same recent tools again and doesn't count them twice.
  const again = new ExpBook(file);
  const a = agent('s1', [tool('2', 'research'), tool('1', 'build')]);
  again.observe([town([a])]);
  assert.equal(a.level.exp, EXP.build + EXP.tool);
});
