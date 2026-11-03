import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { writeFixtures } from '../scripts/fixtures.mjs';

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
let world;
let mod;

const OUT = join(tmpdir(), `kafra-test-${process.pid}`);
after(() => rmSync(OUT, { recursive: true, force: true }));

before(async () => {
  const out = OUT;
  writeFixtures(out, REPO);
  // Source folders are read at import time, so set them before the first import;
  // the other agents point at nothing so this machine's real sessions stay out.
  process.env.KAFRA_PROJECTS_DIR = out;
  process.env.KAFRA_CODEX_DIR = join(out, 'no-codex');
  process.env.KAFRA_GEMINI_DIR = join(out, 'no-gemini');
  mod = await import('../src/world.mjs');
  world = await mod.buildWorld();
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

test('replay: the last hour has the same towns, and a timeline per agent', async () => {
  const r = await mod.buildReplay({ from: Date.now() - 3_600_000, to: Date.now() });
  assert.equal(r.towns.length, 1);
  const ids = r.towns[0].agents.map((a) => a.id);
  assert.ok(ids.length >= 10);
  for (const id of ids) assert.ok(r.timelines[id]?.length, `no timeline for ${id}`);
  const edit = Object.values(r.timelines).flat().find((e) => e.type === 'tool' && e.name === 'Edit');
  assert.equal(edit.building, 'web');
});

test('replay refuses spans longer than two days', async () => {
  await assert.rejects(mod.buildReplay({ from: 0, to: Date.now() }), /maks 2 hari/);
});
