import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

const ROOT = join(tmpdir(), `kafra-sources-${process.pid}`);
const CODEX = join(ROOT, 'codex');
const GEMINI = join(ROOT, 'gemini');
const REPO = join(ROOT, 'repos', 'tavern');
let codex, gemini, index;

const iso = (sAgo = 0) => new Date(Date.now() - sAgo * 1000).toISOString();
const line = (type, payload, sAgo = 0) => JSON.stringify({ timestamp: iso(sAgo), type, payload });

function rollout(name, records) {
  const dir = join(CODEX, '2026', '11', '03');
  mkdirSync(dir, { recursive: true });
  const id = `019c0000-0000-7000-8000-${name.padStart(12, '0')}`;
  writeFileSync(join(dir, `rollout-2026-11-03T10-00-00-${id}.jsonl`), [
    line('session_meta', { id, cwd: REPO, git: { branch: 'main' } }),
    ...records,
  ].join('\n') + '\n');
  return `codex:${id}`;
}

function geminiChat(name, messages, cwd = REPO) {
  const dir = join(GEMINI, createHash('sha256').update(cwd).digest('hex'), 'chats');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `session-${name}.json`), JSON.stringify({ sessionId: name, startTime: iso(60), lastUpdated: iso(), messages }));
}

after(() => rmSync(ROOT, { recursive: true, force: true }));

before(async () => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(REPO, { recursive: true });
  process.env.KAFRA_CODEX_DIR = CODEX;
  process.env.KAFRA_GEMINI_DIR = GEMINI;
  process.env.KAFRA_PROJECTS_DIR = join(ROOT, 'no-claude');

  // Codex: a patch in flight.
  rollout('1', [
    line('turn_context', { cwd: REPO, model: 'gpt-5.4' }),
    line('event_msg', { type: 'task_started', model_context_window: 200_000 }),
    line('event_msg', { type: 'user_message', message: 'fix the inventory crash' }),
    line('event_msg', { type: 'token_count', info: { last_token_usage: { input_tokens: 50_000 } } }),
    line('response_item', { type: 'custom_tool_call', name: 'apply_patch', call_id: 'c1', input: '*** Begin Patch\n*** Update File: ' + REPO + '/Features/Inventory.swift\n' }),
  ]);
  // Codex: a failed test, then the turn ended.
  rollout('2', [
    line('turn_context', { cwd: REPO, model: 'gpt-5.4' }),
    line('event_msg', { type: 'user_message', message: 'run the tests' }),
    line('response_item', { type: 'function_call', name: 'exec_command', call_id: 'c2', arguments: JSON.stringify({ cmd: 'swift test' }) }),
    line('response_item', { type: 'function_call_output', call_id: 'c2', output: 'Chunk ID: 1\nProcess exited with code 1\n' }),
    line('event_msg', { type: 'agent_message', message: 'Two tests fail, want me to fix them?' }),
    line('event_msg', { type: 'task_complete', last_agent_message: 'Two tests fail, want me to fix them?' }),
  ]);

  // Gemini: waiting on your approval for a shell command.
  geminiChat('g1', [
    { id: 1, type: 'user', content: 'deploy the docs', timestamp: iso(30) },
    { id: 2, type: 'gemini', content: '', model: 'gemini-3-pro', tokens: { input: 104_857 }, timestamp: iso(5),
      toolCalls: [{ id: 't1', name: 'run_shell_command', args: { command: 'git push' }, status: 'awaiting_approval' }] },
  ]);
  // Gemini: the same session saved again on resume; only the newest file counts.
  geminiChat('g1-old', [{ id: 1, type: 'user', content: 'old copy', timestamp: iso(600) }]);
  const old = join(GEMINI, createHash('sha256').update(REPO).digest('hex'), 'chats', 'session-g1-old.json');
  const doc = JSON.parse(readFileSync(old, 'utf8'));
  writeFileSync(old, JSON.stringify({ ...doc, sessionId: 'g1' }));
  utimesSync(old, new Date(Date.now() - 600_000), new Date(Date.now() - 600_000));
    // Gemini: a project folder nobody knows; must be skipped, not guessed.
  geminiChat('g2', [{ id: 1, type: 'user', content: 'hi', timestamp: iso(5) }], join(ROOT, 'nowhere', 'secret'));

  codex = await import('../src/sources/codex.mjs');
  gemini = await import('../src/sources/gemini.mjs');
  index = await import('../src/sources/index.mjs');
});

test('codex: a patch in flight is building that file, as a Wizard', async () => {
  const s = (await codex.listSessions()).find((x) => x.quest === 'fix the inventory crash');
  assert.equal(s.job, 'Wizard');
  assert.equal(s.kind, 'build');
  assert.equal(s.status, 'active');
  assert.match(s.tool.file, /Features\/Inventory\.swift$/);
  assert.equal(s.hp, 75);
  assert.equal(s.branch, 'main');
});

test('codex: a non-zero exit is an error, and a finished task waits for you', async () => {
  const s = (await codex.listSessions()).find((x) => x.quest === 'run the tests');
  assert.equal(s.kind, 'waiting');
  assert.equal(s.tools[0].kind, 'trial');
  assert.equal(s.tools[0].error, true);
  assert.match(s.preview, /Two tests fail/);
});

test('codex: tool names map to kinds', () => {
  assert.equal(codex.codexTool('exec_command', { cmd: 'git commit -m x' }).kind, 'deliver');
  assert.equal(codex.codexTool('shell_command', { command: ['bash', '-lc', 'npm test'] }).kind, 'trial');
  assert.equal(codex.codexTool('view_image', { path: '/a.png' }).kind, 'research');
  assert.equal(codex.codexTool('mcp__x__slack__post').kind, 'craft');
  assert.equal(codex.codexFailed('Process exited with code 0'), false);
  assert.equal(codex.codexFailed('exec_command failed: CreateProcess'), true);
});

test('gemini: the project hash resolves to the working directory; approval is a question', async () => {
  const [s] = await gemini.listSessions({ knownCwds: [REPO] });
  assert.equal(s.cwd, REPO);
  assert.equal(s.job, 'Sage');
  assert.equal(s.kind, 'ask');
  assert.equal(s.hp, 90);
});

test('gemini: an unknown project folder is skipped, and a resumed session appears once', async () => {
  const all = await gemini.listSessions({ knownCwds: [REPO] });
  assert.equal(all.length, 1);
  assert.equal(all[0].quest, 'deploy the docs');
});

test('all sources merge into one list with their names', async () => {
  const { sessions } = await index.listSessions();
  const names = new Set(sessions.map((s) => s.sourceName));
  assert.deepEqual([...names].sort(), ['Codex', 'Gemini CLI']);
  assert.equal(sessions.length, 3);
});
