'use strict';

/**
 * appAccess.js — may THIS signed-in account use THIS app?
 *
 * octopus-auth owns the answer (per-user override, then a runtime default, then
 * the shipped default) and exposes it at GET /api/auth/apps/:slug/allowed. This
 * is the enforcing half: without it, taking a tile off someone's hub only hides
 * it, and the app stays reachable by URL. That is what makes a paid app worth
 * paying for, so it is a gate and not a courtesy.
 *
 * An admin always passes (auth says so), and with no rows in auth's tables the
 * answer is "allowed" for everyone, so wiring this in changes nothing until the
 * owner changes a default or a billing event writes a denial.
 *
 * FAILURE MODE. Unreachable auth keeps serving the LAST answer for that user
 * even when it is stale, and with no previous answer fails OPEN. The request has
 * already proved a valid estate session; the only thing an auth outage can cost
 * is a revocation landing late, whereas failing closed would lock every paying
 * customer out of what they paid for during a blip. A revocation lands within
 * CACHE_TTL_MS when auth is up.
 *
 * A 404 from auth means the slug is not in its catalogue — a configuration error
 * here, not a denial there — so it allows and says so loudly.
 */

const CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE = 5000;

function createAppGate({ authUrl, slug, upgradeUrl = '', appName = 'this app', fetchImpl, now = Date.now } = {}) {
  const doFetch = fetchImpl || ((...a) => fetch(...a));
  const cache = new Map();           // username → { allowed, at }

  // `who` is { username, cookie, authorization } — framework-neutral, so the same
  // logic serves a Fastify hook and a unit test.
  async function allowed(who) {
    const key = who.username;
    const hit = key && cache.get(key);
    if (hit && now() - hit.at < CACHE_TTL_MS) return hit.allowed;

    const headers = {};
    if (who.cookie) headers.Cookie = who.cookie;
    if (who.authorization) headers.Authorization = who.authorization;

    try {
      const res = await doFetch(`${authUrl}/api/auth/apps/${encodeURIComponent(slug)}/allowed`, { headers });
      if (res.status === 404) {
        console.warn(`[access] "${slug}" is not an app octopus-auth knows — the gate is doing nothing. Check hub-apps.json.`);
        return true;
      }
      if (!res.ok) throw new Error(`auth answered ${res.status}`);
      const body = await res.json();
      const ok = body.allowed !== false;
      if (key) {
        if (cache.size >= MAX_CACHE) cache.clear();
        cache.set(key, { allowed: ok, at: now() });
      }
      return ok;
    } catch (err) {
      console.warn(`[access] could not check "${slug}" access (${err.message}) — ${hit ? 'using the last answer' : 'allowing'}`);
      return hit ? hit.allowed : true;
    }
  }

  const message = `Your account does not include ${appName}.`;

  // Fastify preHandler. Run it AFTER req.user is set. Only a signed-in browser
  // session is asked about: internal (cortex) callers carry role 'internal' and
  // a shared secret, and are machine-to-machine, not an account using the app.
  async function appGate(req, reply) {
    if (!slug || !req.user || req.user.role === 'internal') return;
    if (await allowed({
      username: req.user.username,
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    })) return;
    return reply.code(403).send({ error: message, code: 'no_access', upgradeUrl: upgradeUrl || null });
  }
  // The same question, for the page check the Next middleware makes via a route.
  appGate.allowed = allowed;
  appGate.message = message;
  appGate.slug = slug || null;
  return appGate;
}

module.exports = { createAppGate, CACHE_TTL_MS };
