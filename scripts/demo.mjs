/**
 * Run Kafra against fixture transcripts, so every animation shows without real agents.
 * Uses this repo as the town and a temp folder for transcripts; ~/.claude is never touched.
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFixtures } from './fixtures.mjs';

const out = join(tmpdir(), 'kafra-demo-projects');
writeFixtures(out, process.cwd());
process.env.KAFRA_PROJECTS_DIR = out;
// Fake towns earn fake EXP: keep it out of your real ~/.config/kafra/exp.json.
process.env.KAFRA_EXP_FILE ??= join(tmpdir(), 'kafra-demo-exp.json');
process.env.KAFRA_SOURCES ??= 'claude-code';
process.env.KAFRA_PORT ??= '4318';
await import('../src/server.mjs');
