import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierOf, moodOf, biomeOf } from '../src/growth.mjs';

const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 1);

test('a new repo is a camp, and says what it takes to grow', () => {
  const t = tierOf({ files: 5, commitsTotal: 2, firstCommitAt: now - DAY }, now);
  assert.equal(t.id, 'camp');
  assert.equal(t.next.name, 'Village');
  assert.equal(t.next.files, 25);
});

test('size alone is not enough: commits are a floor', () => {
  assert.equal(tierOf({ files: 5000, commitsTotal: 3, firstCommitAt: now - 400 * DAY }, now).id, 'camp');
  assert.equal(tierOf({ files: 600, commitsTotal: 200, firstCommitAt: now - 30 * DAY }, now).id, 'city');
});

test('a capital also needs half a year of history', () => {
  const big = { files: 3000, commitsTotal: 900 };
  assert.equal(tierOf({ ...big, firstCommitAt: now - 30 * DAY }, now).id, 'city');
  const cap = tierOf({ ...big, firstCommitAt: now - 365 * DAY }, now);
  assert.equal(cap.id, 'capital');
  assert.equal(cap.next, null);
});

test('mood follows commit recency', () => {
  assert.equal(moodOf({ commits30: 0, lastCommitAt: now - 60 * DAY }, now), 'abandoned');
  assert.equal(moodOf({ commits30: 0, lastCommitAt: null }, now), 'steady');
  assert.equal(moodOf({ commits30: 45, lastCommitAt: now - DAY }, now), 'bustling');
  assert.equal(moodOf({ commits30: 4, lastCommitAt: now - DAY }, now), 'steady');
});

test('the biggest language family picks the biome', () => {
  assert.equal(biomeOf(['App/A.swift', 'App/B.swift', 'README.md', 'x.json']).id, 'coast');
  assert.equal(biomeOf(['src/a.ts', 'src/b.tsx', 'web/c.js']).id, 'desert');
  assert.equal(biomeOf(['main.go', 'lib.rs']).id, 'snow');
  assert.equal(biomeOf(['a.py', 'b.ipynb', 'c.md', 'd.md', 'e.md']).id, 'forest');
});

test('docs only win when there is no code; nothing known falls back to plains', () => {
  assert.equal(biomeOf(['a.md', 'b.md']).id, 'meadow');
  assert.equal(biomeOf(['Makefile', 'LICENSE']).id, 'plains');
});
