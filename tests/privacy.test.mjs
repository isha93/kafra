import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { pathMatcher, visible, publicWorld, publicSessions } from '../src/privacy.mjs';
import { setExtraRedactions, redact } from '../src/activity.mjs';

test('patterns match a folder and everything inside it', () => {
  const m = pathMatcher('/work/clients/*');
  assert.equal(m.test('/work/clients/acme'), true);
  assert.equal(m.test('/work/clients/acme/app'), true);
  assert.equal(m.test('/work/internal/app'), false);
});

test('~ is home, ** crosses folders, a bare name matches anywhere', () => {
  assert.equal(pathMatcher('~/secret').test(`${homedir()}/secret/x`), true);
  assert.equal(pathMatcher('/a/**/deep').test('/a/b/c/deep'), true);
  assert.equal(pathMatcher('top-secret').test('/Users/me/code/top-secret'), true);
  assert.equal(pathMatcher('top-secret').test('/Users/me/code/not-top-secret'), false);
});

test('hide wins; only limits; nothing configured shows everything', () => {
  assert.equal(visible('/code/a', {}), true);
  assert.equal(visible('/code/a', { hide: ['/code/a'] }), false);
  assert.equal(visible('/code/b', { only: ['/code/a'] }), false);
  assert.equal(visible('/code/a', { only: ['/code/*'], hide: ['/code/a'] }), false);
});

test('extra redactions: literal words case-insensitively, and /regex/', () => {
  setExtraRedactions(['ACME Corp', '/internal\\.[a-z]+\\.com/']);
  assert.equal(redact('ship acme corp build to api.internal.acme.com'), 'ship •••• build to api.••••');
  setExtraRedactions([]);
  assert.equal(redact('acme corp'), 'acme corp');
});

const SECRET = ['/Users/me/clients/acme-portal', 'acme-portal', 'acme-inc', 'feature/acme-billing', 'Fix ACME invoice', 'invoice.ts', 'Ship the ACME billing page', 'src/billing/invoice.ts'];

const world = {
  scannedAt: 'now',
  towns: [{
    id: '/Users/me/clients/acme-portal', town: 'Payon', name: 'acme-portal', owner: 'acme-inc', root: '/Users/me/clients/acme-portal',
    branch: 'feature/acme-billing',
    districts: [{ name: 'src', files: 10, churn: 4, commits: 1, dirty: 1 }, { name: '(root)', files: 2, churn: 0, commits: 0, dirty: 0 }],
    commits: [{ hash: 'abc1234', at: 1, author: 'me', subject: 'Fix ACME invoice', added: 3, removed: 1, districts: ['src'] }],
    totals: { files: 12, commitsWeek: 1, dirty: 1 }, growth: { files: 12 }, tier: { id: 'camp' }, mood: 'steady', biome: { id: 'plains' },
    agents: [{
      id: 'session-1', leader: null, model: 'claude-opus', job: 'Lord Knight', sprite: 'knight', hp: 80, kind: 'build', status: 'active',
      title: 'Ship the ACME billing page', quest: 'Ship the ACME billing page', preview: 'editing invoice.ts',
      tool: { id: 't1', name: 'Edit', kind: 'build', file: '/Users/me/clients/acme-portal/src/billing/invoice.ts', at: 'x' },
      tools: [{ id: 't1', name: 'Edit', kind: 'build', file: '/Users/me/clients/acme-portal/src/billing/invoice.ts', label: 'invoice.ts' }],
      cwd: '/Users/me/clients/acme-portal', branch: 'feature/acme-billing', building: 'src', file: 'src/billing/invoice.ts', touched: ['src'],
    }],
    active: 1, lastSeenMs: 0,
  }],
};

test('public mode leaves no names, paths, prompts or commit text', () => {
  const json = JSON.stringify(publicWorld(world));
  for (const s of SECRET) assert.equal(json.includes(s), false, `leaked: ${s}`);
  assert.equal(json.includes('abc1234'), false);
});

test('public mode keeps the game: tiers, kinds, statuses, district buildings', () => {
  const t = publicWorld(world).towns[0];
  assert.equal(t.town, 'Payon');
  assert.equal(t.tier.id, 'camp');
  assert.equal(t.agents[0].kind, 'build');
  assert.equal(t.agents[0].building, t.districts.find((d) => d.files === 10).name);
  assert.match(t.owner, /^Kerajaan \d+$/);
});

test('party window sessions are stripped too', () => {
  const json = JSON.stringify(publicSessions({ sessions: [{ ...world.towns[0].agents[0], map: 'acme-portal', party: [] }] }));
  for (const s of SECRET) assert.equal(json.includes(s), false, `leaked: ${s}`);
});
