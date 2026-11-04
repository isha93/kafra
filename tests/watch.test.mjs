import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWatching, changeVersion, nextChange } from '../src/watch.mjs';

test('a write anywhere under a watched folder wakes the stream at once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kafra-test-watch-'));
  mkdirSync(join(root, 'project'));
  assert.equal(startWatching([root, join(root, 'missing')]), 1);
  const seen = changeVersion();
  const woke = nextChange(seen).then(() => Date.now());
  const wrote = Date.now();
  // Some platforms deliver the first events late; keep writing until one lands.
  const timer = setInterval(() => appendFileSync(join(root, 'project', 'session.jsonl'), '{}\n'), 50);
  const at = await woke;
  clearInterval(timer);
  assert.ok(changeVersion() > seen);
  assert.ok(at - wrote < 2000, `woke after ${at - wrote} ms`);
});

test('a change that already happened resolves right away', async () => {
  const before = changeVersion() - 1;
  const t0 = Date.now();
  await nextChange(before);
  assert.ok(Date.now() - t0 < 50);
});
