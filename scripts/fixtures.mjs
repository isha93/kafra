/**
 * Fake Claude Code transcripts covering every activity kind, for demos and tests.
 *
 *   node scripts/fixtures.mjs <out-dir> [repo-cwd]
 *
 * Never point <out-dir> at ~/.claude/projects: it is wiped first.
 */
import { mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export function writeFixtures(out, cwd) {
  // This wipes `out`. Refuse anything that could be real Claude Code state.
  if (resolve(out).startsWith(join(homedir(), '.claude'))) throw new Error(`refusing to write fixtures into ${out}`);
  rmSync(out, { recursive: true, force: true });
  const dir = join(out, cwd.replace(/\//g, '-'));
  mkdirSync(dir, { recursive: true });
  const now = new Date().toISOString();
  const base = { cwd, gitBranch: 'main', version: '2.1.0', timestamp: now };
  const usage = (n) => ({ input_tokens: 10, cache_read_input_tokens: n, cache_creation_input_tokens: 0, output_tokens: 5 });
  let n = 0;
  function session(model, title, tool, input, { result = false, error = false, text = null, tokens = 200000, ageMin = 0, prompt = 'build the new feature' } = {}) {
    const id = `fixture-${++n}`;
    const recs = [
      { ...base, sessionId: id, type: 'user', message: { role: 'user', content: prompt } },
      { type: 'ai-title', aiTitle: title, sessionId: id },
    ];
    if (tool) recs.push({ ...base, sessionId: id, type: 'assistant', message: { model, usage: usage(tokens), content: [{ type: 'tool_use', id: `tu-${id}`, name: tool, input }] } });
    if (result) recs.push({ ...base, sessionId: id, type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `tu-${id}`, content: 'ok', is_error: error }] } });
    if (text) recs.push({ ...base, sessionId: id, type: 'assistant', message: { model, usage: usage(tokens), content: [{ type: 'text', text }] } });
    const f = join(dir, `${id}.jsonl`);
    writeFileSync(f, recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    if (ageMin) { const t = new Date(Date.now() - ageMin * 60000); utimesSync(f, t, t); }
    return id;
  }
  session('claude-opus-5-5', 'Build the city view', 'Edit', { file_path: `${cwd}/web/city/agent.js` });
  session('claude-sonnet-5-5', 'Edit the backend', 'Write', { file_path: `${cwd}/src/world.mjs` }, { result: true, tokens: 900000 });
  session('claude-haiku-5-5', 'Find the parser bug', 'Grep', { pattern: 'tool_use', path: cwd });
  session('claude-sonnet-5-5', 'Run the tests', 'Bash', { command: 'npm test', description: 'Run test suite' }, { result: true, error: true });
  session('claude-fable-5-1', 'Research PixiJS', 'WebSearch', { query: 'pixijs v8 sprite sheet' });
  session('claude-opus-5-5', 'Install dependencies', 'Bash', { command: 'npm install', description: 'Install dependencies' });
  session('claude-opus-5-5', 'Commit the feature', 'Bash', { command: 'git commit -m "feat"', description: 'Commit changes' });
  const lead = session('claude-opus-5-5', 'Security audit', 'Agent', { description: 'Audit read-only safety', subagent_type: 'Explore' });
  session('claude-sonnet-5-5', 'Review the README', null, null, { text: 'All done. Carry on?' });
  session('claude-haiku-5-5', 'An old session', null, null, { text: 'done', ageMin: 120 });
  session('claude-sonnet-5-5', 'An idle session', null, null, { text: 'ok', ageMin: 10, tokens: 950000 });
  // A subagent under the auditing session.
  const sub = join(dir, lead, 'subagents');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, 'agent-x1.jsonl'), JSON.stringify({ ...base, sessionId: lead, isSidechain: true, type: 'assistant', message: { model: 'claude-haiku-5-5', usage: usage(30000), content: [{ type: 'tool_use', id: 'tu-sub', name: 'Read', input: { file_path: `${cwd}/src/repos.mjs` } }] } }) + '\n');
  writeFileSync(join(sub, 'agent-x1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Audit read-only safety' }));
  return { dir, lead };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, cwd = process.cwd()] = process.argv.slice(2);
  if (!out) { console.error('usage: node scripts/fixtures.mjs <out-dir> [repo-cwd]'); process.exit(1); }
  writeFixtures(out, cwd);
  console.log(`fixtures in ${out}`);
}
