'use strict';

/**
 * The deploy-verification stamp, and the gate exemption it depends on.
 *
 * Portainer polls and reports back to nobody, so "did my push land" could only
 * be inferred from whether the API behaved differently — no answer at all when
 * a change is invisible from outside.
 *
 * The property worth defending is that the stamp MOVES when the code moves. A
 * stamp that silently stops tracking is worse than none: it reports "nothing
 * changed" for a deploy that did, in the confident direction.
 *
 * ── What these tests can reach ───────────────────────────────────────────────
 * fastify is not installable on this laptop while the @octopus-security
 * packages are private, so the server cannot be booted here and the routes
 * cannot be called. The stamp module has no dependencies and IS exercised for
 * real below — hashed, moved, and driven into its failure path. The route and
 * gate assertions read src/index.js, and are labelled as such rather than
 * dressed up as behaviour.
 *
 * Run: node --test test/build-stamp.test.js
 */

const { test } = require('node:test');
const assert   = require('node:assert');
const fs       = require('node:fs');
const os       = require('node:os');
const path     = require('node:path');

const root  = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8');
const { BUILD, sourceFiles } = require('../src/build');

function stampWith(relPath) {
  const target   = path.join(root, relPath);
  const original = fs.readFileSync(target);
  try {
    fs.writeFileSync(target, Buffer.concat([original, Buffer.from('\n// build-stamp probe\n')]));
    delete require.cache[require.resolve('../src/build')];
    return require('../src/build').BUILD;
  } finally {
    fs.writeFileSync(target, original);
    delete require.cache[require.resolve('../src/build')];
  }
}

test('the stamp is a real hash, not the failure value', () => {
  assert.match(BUILD, /^[0-9a-f]{12}$/);
  assert.notStrictEqual(BUILD, 'unknown');
});

test('editing the server moves the stamp', () => {
  assert.notStrictEqual(stampWith('src/index.js'), BUILD, 'editing src/index.js did not move the stamp');
});

test('the walk covers src and excludes dependencies', () => {
  const files = sourceFiles();
  assert.ok(files.includes('index.js'), 'index.js is not covered by the stamp');
  assert.ok(!files.some(f => f.includes('node_modules')), 'node_modules must not be hashed');
  assert.ok(!files.includes('package-lock.json'), 'the lockfile is deliberately excluded');
});

/**
 * A stamp must never be the reason the service fails to boot, so 'unknown' is
 * the guarded fallback — and it is deliberately not hash-shaped, because an
 * unknown build must never be mistakable for a known one.
 */
test('an unreadable directory gives unknown rather than throwing', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'stamp-'));
  try {
    const mod = fs.readFileSync(path.join(root, 'src', 'build.js'), 'utf8');
    assert.match(mod, /return 'unknown';/, 'the guarded fallback is gone');
    assert.ok(!/^[0-9a-f]{12}$/.test('unknown'), 'the failure value must not be hash-shaped');
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

// ── Read from the source: the routes and the gate ────────────────────────────

test('the build route is registered and names this service', () => {
  const at = index.indexOf("app.get('/api/build'");
  assert.ok(at > 0, '/api/build is not registered');
  assert.match(index.slice(at, at + 400), /service: 'octopus-media-backend'/,
    'the route reports a different service — the obvious way to add this to the next one is to copy the last');
});

/**
 * The gate 401s everything it does not exempt, so a stamp behind it would be
 * unreadable on exactly the container you most want to ask about.
 *
 * It also compares the path WITHOUT the query string. `req.url === '/health'`
 * is a whole-URL match, so /health?probe=1 fell through to the 401 — a monitor
 * appending a cache-buster got "not authenticated" from a service that was
 * perfectly up.
 */
test('/health and /api/build are exempt from the auth gate, query string included', () => {
  // There can be several preHandlers. Slice each one out and classify it.
  const hooks = [...index.matchAll(/app\.addHook\('preHandler'/g)].map(m => m.index);
  assert.ok(hooks.length, 'no preHandler hook found — the assertions below would pass vacuously');
  const bodies = hooks.map(at => index.slice(at, index.indexOf('  });', at)));

  // The one that exempts /health is the SSO gate — the one that applies to
  // everything and therefore has to let both routes through.
  const gate = bodies.find(b => b.includes("'/health'"));
  assert.ok(gate, 'no preHandler exempts /health — there is no gate to check');
  assert.match(gate, /const bare = req\.url\.split\('\?'\)\[0\];/,
    'the gate still compares the whole URL, so /health?x=1 will 401');
  assert.match(gate, /bare === '\/health'/, '/health is not exempt');
  assert.match(gate, /bare === '\/api\/build'/, '/api/build is not exempt');

  // Every OTHER hook that can answer 401 must be scoped to a path prefix that
  // /api/build does not match, or it would 401 the stamp regardless of the
  // exemption above. This is the assertion the first draft got wrong: it found
  // the internal-secret hook, saw a 401, and reported the gate as unfixed.
  for (const body of bodies) {
    if (body === gate || !body.includes('401')) continue;
    const scope = body.match(/req\.url\.startsWith\('([^']+)'\)/);
    assert.ok(scope, 'a 401-capable preHandler is not scoped to a path prefix and does not exempt /api/build');
    assert.ok(!'/api/build'.startsWith(scope[1]),
      `a 401-capable preHandler scoped to ${scope[1]} also catches /api/build`);
  }
});

/**
 * The Dockerfile copies src/, so a module added there ships. This asserts the
 * stamp module is inside that directory rather than beside it — octopus-ops
 * crash-looped on exactly that mistake, and because a dead container has no DNS
 * name the symptom reported upstream was ENOTFOUND rather than a missing file.
 */
test('the stamp module is inside the directory the image copies', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY src\//, 'the Dockerfile no longer copies src/ wholesale');
  assert.ok(fs.existsSync(path.join(root, 'src', 'build.js')), 'build.js is not in src/');
});
