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
process.env.KAFRA_PORT ??= '4318';
await import('../src/server.mjs');
