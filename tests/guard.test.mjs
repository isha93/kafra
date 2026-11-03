import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedHost, allowedOrigin } from '../src/guard.mjs';

test('only loopback names on our own port count as our host', () => {
  assert.equal(allowedHost('127.0.0.1:4317', 4317), true);
  assert.equal(allowedHost('localhost:4317', 4317), true);
  assert.equal(allowedHost('[::1]:4317', 4317), true);
});

test('DNS rebinding hosts and other ports are refused', () => {
  assert.equal(allowedHost('evil.example:4317', 4317), false);
  assert.equal(allowedHost('127.0.0.1.nip.io:4317', 4317), false);
  assert.equal(allowedHost('127.0.0.1:8080', 4317), false);
  assert.equal(allowedHost('127.0.0.1', 4317), false);
  assert.equal(allowedHost(undefined, 4317), false);
});

test('requests from other sites are refused, our own page and plain tools are not', () => {
  assert.equal(allowedOrigin({ fetchSite: 'same-origin', origin: 'http://127.0.0.1:4317' }, 4317), true);
  assert.equal(allowedOrigin({ fetchSite: 'none' }, 4317), true);
  assert.equal(allowedOrigin({}, 4317), true);
  assert.equal(allowedOrigin({ fetchSite: 'cross-site' }, 4317), false);
  assert.equal(allowedOrigin({ fetchSite: 'same-site' }, 4317), false);
  assert.equal(allowedOrigin({ origin: 'https://evil.example' }, 4317), false);
});
