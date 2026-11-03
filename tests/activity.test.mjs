import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kindOfClaudeTool, targetOfClaudeTool, redact } from '../src/activity.mjs';

test('file-writing tools are building', () => {
  for (const name of ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']) assert.equal(kindOfClaudeTool(name), 'build');
});

test('Bash splits into commit, test and everything else', () => {
  assert.equal(kindOfClaudeTool('Bash', { command: 'git commit -m "x"' }), 'deliver');
  assert.equal(kindOfClaudeTool('Bash', { command: 'gh pr create --fill' }), 'deliver');
  assert.equal(kindOfClaudeTool('Bash', { command: 'npm test' }), 'trial');
  assert.equal(kindOfClaudeTool('Bash', { command: 'xcodebuild -scheme App test' }), 'trial');
  assert.equal(kindOfClaudeTool('Bash', { command: 'git status' }), 'craft');
  assert.equal(kindOfClaudeTool('Bash', {}), 'craft');
});

test('unknown and MCP tools fall back to craft', () => {
  assert.equal(kindOfClaudeTool('mcp__x__y'), 'craft');
  assert.equal(kindOfClaudeTool(undefined), 'craft');
});

test('target prefers the file, then a short label', () => {
  assert.deepEqual(targetOfClaudeTool('Edit', { file_path: '/r/src/a.js' }), { file: '/r/src/a.js' });
  assert.deepEqual(targetOfClaudeTool('Bash', { command: 'ls', description: 'List   files' }), { label: 'List files' });
  assert.deepEqual(targetOfClaudeTool('Grep', { pattern: 'foo', path: '/r' }), { label: 'foo' });
});

test('redact masks credential-shaped strings and keeps the rest', () => {
  assert.equal(redact('key sk-ant-abcdefghijklmnopqrstu done'), 'key •••• done');
  assert.equal(redact('ghp_abcdefghijklmnopqrstuvwxyz0123'), '••••');
  assert.equal(redact('API_KEY=supersecretvalue next'), 'API_KEY=•••• next');
  assert.equal(redact('password: hunter22'), 'password: ••••');
  assert.equal(redact('key rdpk-abcdefghijklmnopqrstuvwx'), 'key ••••');
  assert.equal(redact('plain text stays'), 'plain text stays');
});

test('long labels are cut before they reach a bubble', () => {
  assert.equal(targetOfClaudeTool('Bash', { description: 'x'.repeat(200) }).label.length, 80);
});
