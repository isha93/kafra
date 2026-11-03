import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeT, serverLang, normalise, setLang, districtName, kingdomName } from '../web/city/i18n.js';

test('English and Indonesian have exactly the same keys', () => {
  // Read the table straight from the source, so a key missing in one language fails here.
  const src = readFileSync(new URL('../web/city/i18n.js', import.meta.url), 'utf8');
  const block = (lang) => src.slice(src.indexOf(`  ${lang}: {`), src.indexOf('\n  },', src.indexOf(`  ${lang}: {`)));
  const keys = (lang) => [...block(lang).matchAll(/(?:'([^']+)'|(\b[a-z][\w]*)):\s*'/g)].map((m) => m[1] ?? m[2]).sort();
  assert.deepEqual(keys('id'), keys('en'));
  assert.ok(keys('en').length > 150);
});

test('placeholders are filled, and unknown keys fall back to English, then to the key', () => {
  assert.equal(makeT('en')('census', { active: 1, total: 2, towns: 3 }), '1 active · 2 adventurers · 3 towns');
  assert.equal(makeT('id')('census', { active: 1, total: 2, towns: 3 }), '1 aktif · 2 adventurer · 3 kota');
  assert.equal(makeT('fr')('kind.build'), 'building');
  assert.equal(makeT('en')('no.such.key'), 'no.such.key');
});

test('the server picks KAFRA_LANG, then the shell locale, then English', () => {
  assert.equal(serverLang({ KAFRA_LANG: 'id' }), 'id');
  assert.equal(serverLang({ LANG: 'id_ID.UTF-8' }), 'id');
  assert.equal(serverLang({ LC_ALL: 'en_US.UTF-8', LANG: 'id_ID.UTF-8' }), 'en');
  assert.equal(serverLang({}), 'en');
  assert.equal(normalise('pt-BR'), null);
});

test('public-mode placeholders read as kingdoms and districts in either language', () => {
  setLang('en');
  assert.equal(kingdomName('#2'), 'Kingdom 2');
  assert.equal(kingdomName(''), 'The Wilds');
  assert.equal(districtName('#3'), 'District 3');
  assert.equal(districtName('(root)'), 'Town Hall');
  assert.equal(districtName('src'), 'src/');
  setLang('id');
  assert.equal(kingdomName('#2'), 'Kerajaan 2');
  assert.equal(districtName('#3'), 'Distrik 3');
  setLang('en');
});
