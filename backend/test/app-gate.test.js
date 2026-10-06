'use strict';

/**
 * The per-app access gate (appAccess.js) and its wiring.
 *
 * Hiding a hub tile is presentation; this is the enforcement. Semantics are
 * octopus-math's: auth answers, an admin always passes (auth says so), a
 * missing row means allowed, unreachable auth serves the last answer or fails
 * OPEN, and a slug auth does not know is allowed with a warning.
 *
 * Run: node --test test/app-gate.test.js
 */

const { test } = require('node:test');
const assert   = require('node:assert');
const fs       = require('node:fs');
const path     = require('node:path');
const { createAppGate } = require('../src/appAccess');

const root  = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'src/index.js'), 'utf8');
const compose = fs.readFileSync(path.join(root, '../docker-compose.yml'), 'utf8');

const SLUG = 'media';
const answer = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function call(gate, user = { username: 'someone', role: 'user' }) {
  const sent = {};
  const reply = { code(c) { sent.code = c; return this; }, send(b) { sent.body = b; return this; } };
  const req = { user, headers: { cookie: 'octopus_sso=t' } };
  return gate(req, reply).then(() => sent);
}

test('refused: a denied signed-in account gets 403 JSON', async () => {
  const g = createAppGate({ authUrl: 'http://a', slug: SLUG, fetchImpl: answer(200, { allowed: false }) });
  const sent = await call(g);
  assert.strictEqual(sent.code, 403);
  assert.strictEqual(sent.body.code, 'no_access');
});

test('allowed: passes, and with no row auth says allowed:true', async () => {
  let url;
  const g = createAppGate({ authUrl: 'http://a', slug: SLUG, fetchImpl: async (u, o) => { url = u; return answer(200, { allowed: true })(); } });
  assert.deepStrictEqual(await call(g), {});
  assert.strictEqual(url, `http://a/api/auth/apps/${SLUG}/allowed`);
});

test('signed-out and internal callers are not this gate\'s business', async () => {
  const g = createAppGate({ authUrl: 'http://a', slug: SLUG, fetchImpl: answer(200, { allowed: false }) });
  assert.deepStrictEqual(await call(g, null), {});
  assert.deepStrictEqual(await call(g, { username: 'x', role: 'internal' }), {});
});

test('auth unreachable: fails open with no history, serves the last answer otherwise', async () => {
  let t = 0, mode = 'deny';
  const fetchImpl = async () => { if (mode === 'down') throw new Error('down'); return answer(200, { allowed: false })(); };
  const g = createAppGate({ authUrl: 'http://a', slug: SLUG, fetchImpl, now: () => t });
  mode = 'down';
  assert.deepStrictEqual(await call(g, { username: 'new', role: 'user' }), {});      // no history: open
  mode = 'deny';
  assert.strictEqual((await call(g)).code, 403);
  mode = 'down'; t += 120000;                                                         // stale, auth down
  assert.strictEqual((await call(g)).code, 403);
});

test('an unknown slug (auth 404) allows rather than locking everyone out', async () => {
  const g = createAppGate({ authUrl: 'http://a', slug: SLUG, fetchImpl: answer(404, {}) });
  assert.deepStrictEqual(await call(g), {});
});

test('/api/build reports the mounted gate, derived not typed', async () => {
  const g = createAppGate({ authUrl: 'http://a', slug: SLUG });
  assert.strictEqual(g.slug, SLUG);
  assert.strictEqual(createAppGate({ authUrl: 'http://a', slug: '' }).slug, null);
  assert.match(index, /\.\.\.\(appAccessGate\.slug \? \{ gate: appAccessGate\.slug \} : \{\}\)/);
  assert.ok(!new RegExp(`gate: ['"]${SLUG}['"]`).test(index), 'gate must not be a pasted constant');
});

test('wiring: slug default, compose, hook after SSO and ahead of routes', () => {
  assert.ok(index.includes(`process.env.APP_ACCESS_SLUG || '${SLUG}'`));
  assert.ok(compose.includes(`APP_ACCESS_SLUG=\${APP_ACCESS_SLUG:-${SLUG}}`));
  const hook = index.indexOf('appAccessGate(req, reply)');
  assert.ok(hook > 0 && hook < index.indexOf("app.get('/health'"), 'gate hook must be registered before the routes');
  assert.ok(index.lastIndexOf("addHook('preHandler'", hook) > index.indexOf('verifyToken(token)'));
  assert.match(index, /bare === '\/health' \|\| bare === '\/api\/build'/);
});
