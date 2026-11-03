import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeFixtures } from '../scripts/fixtures.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
let world;

before(async () => {
  const out = join(tmpdir(), `kafra-test-${process.pid}`);
  writeFixtures(out, REPO);
  // PROJECTS_DIR is read at import time, so set it before the first import.
  process.env.KAFRA_PROJECTS_DIR = out;
  const { buildWorld } = await import('../src/world.mjs');
  world = await buildWorld();
});

const byTitle = (title) => world.towns.flatMap((t) => t.agents).find((a) => a.title === title);

test('one repo becomes one town', () => {
  assert.equal(world.towns.length, 1);
  assert.equal(world.towns[0].root, REPO);
  assert.ok(world.towns[0].town);
});

test('a pending Edit puts the agent at the district that owns the file', () => {
  const a = byTitle('Bikin city view');
  assert.equal(a.kind, 'build');
  assert.equal(a.status, 'active');
  assert.equal(a.building, 'web');
  assert.equal(a.file, 'web/city/agent.js');
});

test('a finished tool keeps its kind while the model thinks', () => {
  assert.equal(byTitle('Edit backend').kind, 'build');
});

test('a failed tool is marked as an error', () => {
  const a = byTitle('Jalankan test');
  assert.equal(a.kind, 'trial');
  assert.equal(a.tools[0].error, true);
});

test('an assistant turn without tools means it is your turn', () => {
  assert.equal(byTitle('Review README').kind, 'waiting');
});

test('old sessions rest at the inn', () => {
  assert.equal(byTitle('Sesi lama').kind, 'resting');
});

test('subagents join their leader as party members', () => {
  const town = world.towns[0];
  const lead = byTitle('Audit keamanan');
  assert.equal(lead.kind, 'summon');
  const member = town.agents.find((a) => a.leader === lead.id);
  assert.ok(member);
  assert.equal(member.isParty, true);
  assert.equal(member.agentType, 'Explore');
  assert.equal(member.kind, 'research');
});

test('HP falls as context fills', () => {
  assert.equal(byTitle('Sesi idle').hp, 5);
});
