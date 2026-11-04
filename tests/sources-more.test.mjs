import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every source reads its folder at import, so point them at fixtures first.
const root = mkdtempSync(join(tmpdir(), 'kafra-test-sources-more-'));
const repo = join(root, 'my-app');
mkdirSync(repo);
process.env.KAFRA_CURSOR_DIR = join(root, 'cursor');
process.env.KAFRA_OPENCODE_DB = join(root, 'opencode.db');
process.env.KAFRA_AIDER_ROOT = join(root, 'home');

let sqlite = null;
try {
  const warn = process.emitWarning;
  process.emitWarning = () => {};
  ({ DatabaseSync: sqlite } = await import('node:sqlite'));
  process.emitWarning = warn;
} catch { /* Node without node:sqlite: OpenCode is skipped */ }

const now = Date.now();
let cursor, opencode, aider;
before(async () => {
  cursor = await import('../src/sources/cursor.mjs');
  opencode = await import('../src/sources/opencode.mjs');
  aider = await import('../src/sources/aider.mjs');
});

test('Cursor: a transcript becomes a session, with its tools, quest and subagent', async () => {
  const conv = join(process.env.KAFRA_CURSOR_DIR, repo.slice(1).replaceAll('/', '-'), 'agent-transcripts', 'conv-1');
  mkdirSync(join(conv, 'subagents'), { recursive: true });
  const line = (o) => JSON.stringify(o);
  writeFileSync(join(conv, 'conv-1.jsonl'), [
    line({ role: 'user', message: { content: [{ type: 'text', text: '<user_info>Workspace Path: ' + repo + '</user_info>\n<user_query>Fix the login bug</user_query>' }] } }),
    line({ role: 'assistant', message: { content: [{ type: 'text', text: 'Reading it.' }, { type: 'tool_use', id: 't1', name: 'Read', input: { path: join(repo, 'src/login.ts') } }] } }),
    line({ role: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }),
    line({ role: 'assistant', message: { content: [{ type: 'tool_use', id: 't2', name: 'StrReplace', input: { path: join(repo, 'src/login.ts') } }] } }),
    line({ role: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't2', content: 'ok' }] } }),
    line({ role: 'assistant', message: { content: [{ type: 'text', text: 'Fixed it. Anything else?' }] } }),
  ].join('\n') + '\n');
  writeFileSync(join(conv, 'subagents', 'sub-1.jsonl'), line({ role: 'assistant', message: { content: [{ type: 'tool_use', id: 's1', name: 'Shell', input: { command: 'npm test' } }] } }) + '\n');

  const [s] = await cursor.listSessions();
  assert.equal(s.source, 'cursor');
  assert.equal(s.cwd, repo);
  assert.equal(s.quest, 'Fix the login bug');
  assert.equal(s.kind, 'waiting');
  assert.deepEqual(s.tools.map((t) => [t.kind, t.done]), [['build', true], ['research', true]]);
  assert.equal(s.party.length, 1);
  assert.equal(s.party[0].tools[0].kind, 'trial');
});

test('Cursor: a project folder name is decoded back into a path that exists', () => {
  assert.equal(cursor.decodeProjectDir(repo.slice(1).replaceAll('/', '-')), repo);
  assert.equal(cursor.decodeProjectDir('no-such-place-anywhere'), null);
});

test('OpenCode: sessions, tool states and subagents from its SQLite database', { skip: !sqlite && 'node:sqlite unavailable' }, async () => {
  const db = new sqlite(process.env.KAFRA_OPENCODE_DB);
  db.exec(`
    CREATE TABLE session_v2 (id TEXT PRIMARY KEY, directory TEXT, title TEXT, parent_id TEXT, model TEXT,
      time_created INTEGER, time_updated INTEGER, time_archived INTEGER);
    CREATE TABLE session_message (id TEXT, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, data TEXT);
    CREATE TABLE session_part (message_id TEXT, session_id TEXT, ordinal INTEGER, type TEXT, call_id TEXT, time_created INTEGER, data TEXT);`);
  const session = db.prepare('INSERT INTO session_v2 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)');
  session.run('ses_1', repo, 'Add dark mode', null, JSON.stringify({ id: 'claude-sonnet-5-5', providerID: 'anthropic' }), now - 5000, now - 1000);
  session.run('ses_2', repo, 'Explore styles', 'ses_1', null, now - 4000, now - 2000);
  const message = db.prepare('INSERT INTO session_message VALUES (?, ?, ?, ?, ?, ?)');
  message.run('m1', 'ses_1', 'user', 1, now - 5000, JSON.stringify({ text: 'add a dark mode toggle' }));
  message.run('m2', 'ses_1', 'assistant', 2, now - 4000, JSON.stringify({ tokens: { input: 50000, cache: { read: 0, write: 0 } } }));
  const part = db.prepare('INSERT INTO session_part VALUES (?, ?, ?, ?, ?, ?, ?)');
  const tool = (id, name, status, input, t) => JSON.stringify({ type: 'tool', id, name, state: { status, input }, time: { created: t } });
  part.run('m2', 'ses_1', 0, 'tool', 'c1', now - 3000, tool('c1', 'edit', 'completed', { filePath: join(repo, 'theme.css') }, now - 3000));
  part.run('m2', 'ses_1', 1, 'tool', 'c2', now - 2000, tool('c2', 'bash', 'running', { command: 'npm test' }, now - 2000));
  db.close();

  const [s] = await opencode.listSessions();
  assert.equal(s.id, 'opencode:ses_1');
  assert.equal(s.title, 'Add dark mode');
  assert.equal(s.quest, 'add a dark mode toggle');
  assert.equal(s.hp, 75);
  assert.equal(s.kind, 'trial');
  assert.equal(s.tool.label, 'npm test');
  assert.deepEqual(s.tools.map((t) => [t.kind, t.done]), [['trial', false], ['build', true]]);
  assert.equal(s.party[0].id, 'opencode:ses_2');

  const replay = await opencode.replaySessions({ from: now - 10_000, to: now });
  assert.deepEqual(replay.find((r) => r.id === 'opencode:ses_1').events.map((e) => e.type), ['prompt', 'tool', 'result', 'tool']);
});

test('Aider: the newest session in a history file, from its blockquotes', async () => {
  const home = join(process.env.KAFRA_AIDER_ROOT, 'code', 'shop');
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, aider.HISTORY), [
    '# aider chat started at 2026-11-01 09:00:00', '', '#### an old session', '> Applied edit to old.py', '',
    '# aider chat started at 2026-11-04 10:00:00', '',
    '> Main model: anthropic/claude-sonnet-5-5 with diff edit format', '',
    '#### add a cart total', '',
    '> Added cart.py to the chat.', '',
    'Here is the change.', '',
    '> Applied edit to cart.py', '> Commit 1a2b3c4 feat: add cart total', '> Running pytest -q', '',
    'Tests pass now.', '',
  ].join('\n'));
  assert.deepEqual(await aider.scanHome(), [home]);
  const s = (await aider.listSessions({ knownCwds: [home] }))[0];
  assert.equal(s.id, `aider:${home}:2026-11-04 10:00:00`);
  assert.equal(s.model, 'anthropic/claude-sonnet-5-5');
  assert.equal(s.quest, 'add a cart total');
  assert.equal(s.kind, 'waiting');
  assert.deepEqual(s.tools.map((t) => t.kind), ['trial', 'deliver', 'build', 'research']);
  assert.equal(s.tools[2].file, join(home, 'cart.py'));
  // Ids are byte offsets: reading the file again gives the same ones.
  const again = (await aider.listSessions({ knownCwds: [home] }))[0];
  assert.deepEqual(again.tools.map((t) => t.id), s.tools.map((t) => t.id));
});
