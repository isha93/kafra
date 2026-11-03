import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swiftbarText } from '../src/menubar.mjs';

const now = Date.parse('2026-11-03T12:00:00Z');
const at = (sAgo) => new Date(now - sAgo * 1000).toISOString();
const agent = (over) => ({
  id: 'a', job: 'Lord Knight', kind: 'build', status: 'active', tools: [], lastSeen: at(30),
  tool: { at: at(30), label: 'x' }, file: 'src/app.ts', ...over,
});
const world = (agents) => ({ towns: [{ town: 'Payon', agents }] });

test('the title counts agents waiting for you, in yellow', () => {
  const text = swiftbarText(world([agent({ id: 'w', kind: 'waiting', status: 'idle', preview: 'Done | ok?' }), agent()]), { port: 4317, now });
  assert.match(text.split('\n')[0], /^⚔ 1 \| color=#ffc400$/);
});

test('with nobody waiting the title shows errors, then work, then grey', () => {
  const err = agent({ tools: [{ error: true }] });
  assert.match(swiftbarText(world([err]), { port: 4317, now }).split('\n')[0], /^⚔ ! /);
  assert.match(swiftbarText(world([agent()]), { port: 4317, now }).split('\n')[0], /^⚔ 1 \| color=#5cc030/);
  assert.match(swiftbarText(world([]), { port: 4317, now }).split('\n')[0], /color=#8a8a8a/);
});

test('items link to the agent and never carry a stray "|"', () => {
  const text = swiftbarText(world([agent({ id: 'sess/sub 1', kind: 'waiting', status: 'idle', preview: 'Ship it | now?' })]), { port: 4317, now });
  const item = text.split('\n').find((l) => l.startsWith('Lord Knight'));
  assert.equal(item.split('|').length, 2, item);
  assert.match(item, /href=http:\/\/127\.0\.0\.1:4317\/#agent=sess%2Fsub%201/);
  assert.match(item, /Ship it now\?/);
});

test('a notify hint per waiting agent, none for working or finished subagents', () => {
  const text = swiftbarText(world([
    agent({ id: 'w1', kind: 'waiting', status: 'idle' }),
    agent({ id: 'p1', kind: 'waiting', status: 'idle', isParty: true, agentType: 'Explore' }),
    agent({ id: 'k1' }),
  ]), { port: 4317, now });
  const hints = text.split('\n').filter((l) => l.startsWith('#notify '));
  assert.deepEqual(hints.map((l) => l.split(' ')[1]), ['w1']);
  // Exactly four space-separated fields, each URL-safe, so the shell can paste them.
  const [, id, body, href] = hints[0].split(' ');
  assert.equal(hints[0].split(' ').length, 4);
  assert.match(decodeURIComponent(body), /Lord Knight di Payon menunggu giliranmu/);
  assert.equal(decodeURIComponent(href), 'http://127.0.0.1:4317/#agent=w1');
  for (const f of [id, body, href]) assert.doesNotMatch(f, /[\s&"'`$;|]/);
});

test('sleeping agents collapse into a count', () => {
  const text = swiftbarText(world([agent({ status: 'resting', kind: 'resting' })]), { port: 4317, now });
  assert.match(text, /\+1 istirahat/);
});
