'use strict';

const Fastify      = require('fastify');
const cors         = require('@fastify/cors');
const cookie       = require('@fastify/cookie');
const axios        = require('axios');
const { Pool }     = require('pg');

const pool = new Pool({
  host:     process.env.PGHOST     || 'db',
  port:     parseInt(process.env.PGPORT || '5432'),
  user:     process.env.PGUSER     || 'media',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'media',
});

const AUTH_URL      = process.env.AUTH_SERVICE_URL || 'http://octopus-auth:3002';
const AUTH_LOGIN_BASE = process.env.AUTH_PUBLIC_URL || 'https://auth.octopustechnology.net';

// Machine-to-machine access for cortex, on the docker network only — same
// x-internal-secret pattern budget uses.
//
// The secret proves WHICH SERVICE is calling. It has never proved who it is
// calling FOR, and these routes used to answer that question with a constant:
// every internal read and write landed on MEDIA_OWNER regardless of who was
// talking to the bot. With one account that was invisible. With two, a second
// person asking Neith "what am I watching?" got the owner's list, and anything
// they added went into the owner's library.
//
// Callers now name the account with X-Service-User, which is the fleet
// convention (see octopus-cortex/server/acting-user.js `serviceUserHeader`, and
// octopus-health's `serviceUser()` which this mirrors). MEDIA_OWNER remains the
// default for a call that names nobody, because scheduled work — briefings and
// nudges — legitimately has no acting user and is the owner's by definition.
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
const MEDIA_OWNER     = process.env.MEDIA_OWNER     || 'psychopathy';

// Same shape octopus-auth enforces at registration, so a name that could not be
// registered cannot be conjured here either.
const USERNAME_RE = /^[A-Za-z0-9_-]{3,30}$/;

/** Which account an internal call is acting for. */
function serviceUser(req) {
  const raw = req.headers['x-service-user']
           || (req.body && (req.body.username || req.body.user))
           || (req.query && (req.query.username || req.query.user))
           || MEDIA_OWNER;
  const name = String(raw).trim();
  if (!USERNAME_RE.test(name)) {
    throw Object.assign(new Error(`invalid user "${name}"`), { statusCode: 400 });
  }
  return name;
}

// ── Stateless SSO auth ────────────────────────────────────────────────────────
const SSO_COOKIE   = 'octopus_sso';
// Verified tokens cached 5 min, bounded and swept — an unevicted Map keyed by
// token grows for the lifetime of the process.
const VERIFY_TTL_MS    = 5 * 60 * 1000;
const VERIFY_CACHE_MAX = 500;
const _verifyCache = new Map();

function cacheSet(token, user) {
  const now = Date.now();
  for (const [k, v] of _verifyCache) if (v.exp <= now) _verifyCache.delete(k);
  // Map iterates in insertion order, so this evicts oldest-first.
  while (_verifyCache.size >= VERIFY_CACHE_MAX) _verifyCache.delete(_verifyCache.keys().next().value);
  _verifyCache.set(token, { user, exp: now + VERIFY_TTL_MS });
}

async function verifyToken(token) {
  const cached = _verifyCache.get(token);
  if (cached && cached.exp > Date.now()) return cached.user;
  if (cached) _verifyCache.delete(token);
  try {
    const r = await axios.post(`${AUTH_URL}/api/auth/verify`, {}, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 5000,
    });
    if (r.data && r.data.valid && r.data.user) {
      cacheSet(token, r.data.user);
      return r.data.user;
    }
  } catch { /* invalid or auth unreachable */ }
  return null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const ENTRY_SELECT = `
  SELECT
    me.id, me.user_id, me.type, me.title, me.status,
    me.notes, me.created_at, me.updated_at,
    ep.current_season, ep.current_episode,
    md.artist, md.album, md.song,
    r.rating, r.finished_at
  FROM media_entries me
  LEFT JOIN episode_progress ep ON ep.entry_id = me.id
  LEFT JOIN music_details md    ON md.entry_id = me.id
  LEFT JOIN ratings r           ON r.entry_id  = me.id
`;

async function build() {
  const app = Fastify({ logger: true });

  // ── Plugins ──────────────────────────────────────────────────────────────────
  await app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });
  await app.register(cookie);

  // No IP allowlist. This used to call cortex's /api/check-ip on every request,
  // on top of the SSO gate below — two independent gates for a watch list. It
  // made the app unusable from a phone (every new mobile IP was a lockout, and
  // a cortex hiccup 403'd everything), while adding nothing: the SSO cookie
  // already establishes who you are, and forced 2FA backs it.

  // ── Internal (cortex) auth ────────────────────────────────────────────────────
  // Runs before the SSO hook so machine calls never need a cookie. Fails closed:
  // if INTERNAL_SECRET is unset, /api/internal/* is unreachable rather than open.
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/internal/')) return;
    const given = req.headers['x-internal-secret'];
    if (!INTERNAL_SECRET || given !== INTERNAL_SECRET) {
      return reply.code(401).send({ error: 'Invalid internal secret.' });
    }
    // Resolve the acting account HERE, once, so every internal route below
    // reads req.user.username — identical to the web routes. A route that
    // forgets is then a route using the wrong variable name, not one silently
    // defaulting to the owner.
    try {
      req.user = { username: serviceUser(req), role: 'internal' };
    } catch (err) {
      return reply.code(err.statusCode || 400).send({ error: err.message });
    }
  });

  // ── Set req.user from SSO cookie ──────────────────────────────────────────────
  app.addHook('preHandler', async (req) => {
    if (req.user) return;                       // already authenticated internally
    const token = req.cookies[SSO_COOKIE];
    if (token) {
      const user = await verifyToken(token);
      if (user) req.user = { username: user.username, role: user.role, token };
    }
  });

  // ── Auth gate ─────────────────────────────────────────────────────────────────
  app.addHook('preHandler', async (req, reply) => {
    if (req.url === '/health' || req.url.startsWith('/api/auth/')) return;
    if (!req.user) return reply.code(401).send({ error: 'Not authenticated' });
  });

  // ── Health ────────────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ ok: true, service: 'octopus-media-backend' }));

  // ── Auth ──────────────────────────────────────────────────────────────────────
  app.post('/api/auth/login', async (req, reply) => {
    return reply.code(400).send({ error: 'Login is managed centrally.', loginUrl: `${AUTH_LOGIN_BASE}/login` });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const back = encodeURIComponent(`https://${req.headers.host || 'media.octopustechnology.net'}/`);
    return reply.redirect(`${AUTH_LOGIN_BASE}/logout?redirect=${back}`, 302);
  });

  app.get('/api/auth/logout', async (req, reply) => {
    const back = encodeURIComponent(`https://${req.headers.host || 'media.octopustechnology.net'}/`);
    return reply.redirect(`${AUTH_LOGIN_BASE}/logout?redirect=${back}`, 302);
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (req.user) return { user: { username: req.user.username } };
    return reply.code(401).send({ error: 'Not authenticated' });
  });

  // ── Internal API (cortex) ─────────────────────────────────────────────────────
  // Deliberately title-based rather than id-based: these are driven from chat
  // ("bump Frieren to episode 9"), and requiring an opaque id would mean two
  // round trips and a lookup the model would rather hallucinate.

  // Resolve a title to one entry. Exact (case-insensitive) wins; otherwise a
  // unique substring match. Ambiguity is an error, never a guess.
  async function findByTitle(user_id, title) {
    const { rows } = await pool.query(
      `${ENTRY_SELECT} WHERE me.user_id = $1 AND me.title IS NOT NULL`, [user_id],
    );
    const needle = String(title || '').trim().toLowerCase();
    if (!needle) return { error: 'A title is required.' };
    const exact = rows.filter(r => r.title.toLowerCase() === needle);
    if (exact.length === 1) return { entry: exact[0] };
    const partial = rows.filter(r => r.title.toLowerCase().includes(needle));
    if (partial.length === 1) return { entry: partial[0] };
    if (partial.length > 1) {
      return { error: `"${title}" matches ${partial.length} entries: ${partial.map(r => r.title).join(', ')}. Be more specific.` };
    }
    return { error: `No entry matching "${title}".` };
  }

  app.get('/api/internal/entries', async (req) => {
    const { status = 'watching', type } = req.query;
    const conditions = ['me.user_id = $1'];
    const params = [req.user.username];
    if (status && status !== 'all') { params.push(status); conditions.push(`me.status = $${params.length}`); }
    if (type)                       { params.push(type);   conditions.push(`me.type = $${params.length}`); }
    const { rows } = await pool.query(
      `${ENTRY_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY me.updated_at DESC`, params,
    );
    return {
      entries: rows.map(r => ({
        id: r.id, type: r.type, title: r.title, status: r.status,
        season: r.current_season, episode: r.current_episode,
        artist: r.artist, album: r.album, song: r.song,
        rating: r.rating, notes: r.notes,
      })),
    };
  });

  app.post('/api/internal/progress', async (req, reply) => {
    const { title, season, episode, advance } = req.body || {};
    const found = await findByTitle(req.user.username, title);
    if (found.error) return reply.code(404).send({ error: found.error });
    const e = found.entry;
    if (e.type !== 'anime' && e.type !== 'tv') {
      return reply.code(400).send({ error: `"${e.title}" is a ${e.type}; it has no episode progress.` });
    }

    // `advance` is the common case from chat — "watched another episode".
    const nextEpisode = advance
      ? (e.current_episode || 0) + 1
      : (episode != null ? parseInt(episode) : null);
    const nextSeason = season != null ? parseInt(season) : null;
    if (nextEpisode == null && nextSeason == null) {
      return reply.code(400).send({ error: 'Provide season, episode, or advance:true.' });
    }

    await pool.query(
      `INSERT INTO episode_progress (entry_id, current_season, current_episode) VALUES ($1,$2,$3)
       ON CONFLICT (entry_id) DO UPDATE SET
         current_season  = COALESCE($2, episode_progress.current_season),
         current_episode = COALESCE($3, episode_progress.current_episode)`,
      [e.id, nextSeason, nextEpisode],
    );
    await pool.query(`UPDATE media_entries SET updated_at = now() WHERE id = $1`, [e.id]);

    const { rows: [full] } = await pool.query(`${ENTRY_SELECT} WHERE me.id = $1`, [e.id]);
    return { ok: true, title: full.title, season: full.current_season, episode: full.current_episode };
  });

  app.post('/api/internal/entries', async (req, reply) => {
    const { type, title, notes, season = 1, episode = 1 } = req.body || {};
    if (!['anime', 'movie', 'tv'].includes(type)) {
      return reply.code(400).send({ error: 'type must be anime, movie or tv.' });
    }
    if (!title?.trim()) return reply.code(400).send({ error: 'Title is required.' });

    const { rows: [entry] } = await pool.query(
      `INSERT INTO media_entries (user_id, type, title, notes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.user.username, type, title.trim(), notes?.trim() || null],
    );
    if (type === 'anime' || type === 'tv') {
      await pool.query(
        `INSERT INTO episode_progress (entry_id, current_season, current_episode) VALUES ($1,$2,$3)`,
        [entry.id, parseInt(season) || 1, parseInt(episode) || 1],
      );
    }
    return { ok: true, id: entry.id, title: entry.title, type: entry.type };
  });

  // ── Entries — list ────────────────────────────────────────────────────────────
  app.get('/api/entries', async (req) => {
    const { type, status } = req.query;
    const user_id = req.user.username;
    const conditions = ['me.user_id = $1'];
    const params = [user_id];

    if (type)   { params.push(type);   conditions.push(`me.type = $${params.length}`); }
    if (status) { params.push(status); conditions.push(`me.status = $${params.length}`); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const { rows } = await pool.query(
      `${ENTRY_SELECT} ${where} ORDER BY me.created_at DESC`,
      params,
    );
    return { entries: rows };
  });

  // ── Entries — create ──────────────────────────────────────────────────────────
  app.post('/api/entries', async (req, reply) => {
    const { type, title, notes, starting_season = 1, starting_episode = 1,
            artist, album, song } = req.body;
    const user_id = req.user.username;

    if (!type || !['anime','movie','tv','music'].includes(type)) {
      return reply.code(400).send({ error: 'Invalid type.' });
    }
    if (type !== 'music' && !title?.trim()) {
      return reply.code(400).send({ error: 'Title is required for this type.' });
    }
    if (type === 'music' && !artist?.trim() && !album?.trim() && !song?.trim()) {
      return reply.code(400).send({ error: 'Music entries require at least one of: artist, album, song.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [entry] } = await client.query(
        `INSERT INTO media_entries (user_id, type, title, notes)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [user_id, type, title?.trim() || null, notes?.trim() || null],
      );

      if (type === 'anime' || type === 'tv') {
        await client.query(
          `INSERT INTO episode_progress (entry_id, current_season, current_episode)
           VALUES ($1,$2,$3)`,
          [entry.id, parseInt(starting_season) || 1, parseInt(starting_episode) || 1],
        );
      }
      if (type === 'music') {
        await client.query(
          `INSERT INTO music_details (entry_id, artist, album, song) VALUES ($1,$2,$3,$4)`,
          [entry.id, artist?.trim() || null, album?.trim() || null, song?.trim() || null],
        );
      }

      await client.query('COMMIT');

      const { rows: [full] } = await pool.query(
        `${ENTRY_SELECT} WHERE me.id = $1`, [entry.id],
      );
      return { entry: full };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // ── Entries — update ──────────────────────────────────────────────────────────
  app.patch('/api/entries/:id', async (req, reply) => {
    const { id } = req.params;
    const user_id = req.user.username;

    const { rows: [entry] } = await pool.query(
      `SELECT * FROM media_entries WHERE id = $1 AND user_id = $2`, [id, user_id],
    );
    if (!entry) return reply.code(404).send({ error: 'Not found.' });

    const { title, notes, current_season, current_episode, artist, album, song } = req.body;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE media_entries SET
           title = COALESCE($1, title),
           notes = $2,
           updated_at = now()
         WHERE id = $3`,
        [title?.trim() || null, notes?.trim() || null, id],
      );

      if ((entry.type === 'anime' || entry.type === 'tv') && (current_season != null || current_episode != null)) {
        await client.query(
          `INSERT INTO episode_progress (entry_id, current_season, current_episode) VALUES ($1,$2,$3)
           ON CONFLICT (entry_id) DO UPDATE SET
             current_season  = COALESCE($2, episode_progress.current_season),
             current_episode = COALESCE($3, episode_progress.current_episode)`,
          [id, current_season != null ? parseInt(current_season) : null,
               current_episode != null ? parseInt(current_episode) : null],
        );
      }

      if (entry.type === 'music') {
        const trimmed = { artist: artist?.trim() || null, album: album?.trim() || null, song: song?.trim() || null };
        if (!trimmed.artist && !trimmed.album && !trimmed.song) {
          return reply.code(400).send({ error: 'Music entries require at least one of: artist, album, song.' });
        }
        await client.query(
          `INSERT INTO music_details (entry_id, artist, album, song) VALUES ($1,$2,$3,$4)
           ON CONFLICT (entry_id) DO UPDATE SET artist=$2, album=$3, song=$4`,
          [id, trimmed.artist, trimmed.album, trimmed.song],
        );
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const { rows: [full] } = await pool.query(`${ENTRY_SELECT} WHERE me.id = $1`, [id]);
    return { entry: full };
  });

  // ── Entries — finish ──────────────────────────────────────────────────────────
  app.patch('/api/entries/:id/finish', async (req, reply) => {
    const { id } = req.params;
    const user_id = req.user.username;
    const { rows: [entry] } = await pool.query(
      `SELECT * FROM media_entries WHERE id = $1 AND user_id = $2`, [id, user_id],
    );
    if (!entry) return reply.code(404).send({ error: 'Not found.' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE media_entries SET status = 'finished', updated_at = now() WHERE id = $1`, [id],
      );
      await client.query(
        `INSERT INTO ratings (entry_id) VALUES ($1) ON CONFLICT (entry_id) DO NOTHING`, [id],
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const { rows: [full] } = await pool.query(`${ENTRY_SELECT} WHERE me.id = $1`, [id]);
    return { entry: full };
  });

  // ── Entries — rate ────────────────────────────────────────────────────────────
  app.patch('/api/entries/:id/rate', async (req, reply) => {
    const { id } = req.params;
    const { rating } = req.body;
    const user_id = req.user.username;

    if (!['thumbs_up','thumbs_down', null].includes(rating)) {
      return reply.code(400).send({ error: 'Invalid rating.' });
    }
    const { rows: [entry] } = await pool.query(
      `SELECT * FROM media_entries WHERE id = $1 AND user_id = $2 AND status = 'finished'`, [id, user_id],
    );
    if (!entry) return reply.code(404).send({ error: 'Not found.' });

    await pool.query(
      `INSERT INTO ratings (entry_id, rating) VALUES ($1,$2)
       ON CONFLICT (entry_id) DO UPDATE SET rating = $2`,
      [id, rating],
    );
    const { rows: [full] } = await pool.query(`${ENTRY_SELECT} WHERE me.id = $1`, [id]);
    return { entry: full };
  });

  // ── Entries — delete ──────────────────────────────────────────────────────────
  app.delete('/api/entries/:id', async (req, reply) => {
    const { id } = req.params;
    const user_id = req.user.username;
    const { rowCount } = await pool.query(
      `DELETE FROM media_entries WHERE id = $1 AND user_id = $2`, [id, user_id],
    );
    if (!rowCount) return reply.code(404).send({ error: 'Not found.' });
    return { ok: true };
  });

  return app;
}

build().then(app => {
  app.listen({ port: parseInt(process.env.PORT || '3001'), host: '0.0.0.0' });
}).catch(err => {
  console.error(err);
  process.exit(1);
});
