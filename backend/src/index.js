'use strict';

const Fastify      = require('fastify');
const cors         = require('@fastify/cors');
const cookie       = require('@fastify/cookie');
const session      = require('@fastify/session');
const PgStore      = require('connect-pg-simple')(require('express-session'));
const axios        = require('axios');
const { Pool }     = require('pg');

const pool = new Pool({
  host:     process.env.PGHOST     || 'db',
  port:     parseInt(process.env.PGPORT || '5432'),
  user:     process.env.PGUSER     || 'media',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'media',
});

const AUTH_URL   = process.env.AUTH_SERVICE_URL || 'http://octopus-auth:3002';
const CORTEX_URL = process.env.CORTEX_URL       || 'http://octopus-cortex:3010';

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
  // ── Ensure sessions table exists ──────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session (
      sid    VARCHAR NOT NULL PRIMARY KEY,
      sess   JSON    NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire)`);

  const app = Fastify({ logger: true });

  const pgStore = new PgStore({ pool, tableName: 'session' });

  // ── Plugins ──────────────────────────────────────────────────────────────────
  await app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });
  await app.register(cookie);
  await app.register(session, {
    secret: process.env.SESSION_SECRET || 'media-session-secret-change-me-32ch+',
    cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
    saveUninitialized: false,
    store: pgStore,
  });

  // ── IP allowlist ──────────────────────────────────────────────────────────────
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/health') return;
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (forwarded ? forwarded.split(',')[0].trim() : req.ip || '').replace('::ffff:', '');
    try {
      const r = await axios.get(`${CORTEX_URL}/api/check-ip`, {
        headers: { 'x-forwarded-for': ip },
        timeout: 2000,
      });
      if (!r.data.allowed) {
        return reply.code(403).send({ error: 'Access denied. Request access via Discord.' });
      }
    } catch {
      return reply.code(403).send({ error: 'IP check unavailable.' });
    }
  });

  // ── Auth gate ─────────────────────────────────────────────────────────────────
  app.addHook('preHandler', async (req, reply) => {
    if (req.url === '/health' || req.url.startsWith('/api/auth/')) return;
    if (!req.session.user) return reply.code(401).send({ error: 'Not authenticated' });
  });

  // ── Health ────────────────────────────────────────────────────────────────────
  app.get('/health', async () => ({ ok: true, service: 'octopus-media-backend' }));

  // ── Auth ──────────────────────────────────────────────────────────────────────
  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body;
    try {
      const r = await axios.post(`${AUTH_URL}/api/auth/login`, { username, password }, {
        timeout: 3000,
        validateStatus: () => true,
      });
      if (r.data.success) {
        req.session.user = { username };
        return { ok: true };
      }
      return reply.code(401).send({ error: r.data.error || 'Invalid credentials.' });
    } catch {
      return reply.code(503).send({ error: 'Auth service unavailable.' });
    }
  });

  app.post('/api/auth/logout', async (req) => {
    await new Promise(resolve => req.session.destroy(resolve));
    return { ok: true };
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (req.session.user) return { user: req.session.user };
    return reply.code(401).send({ error: 'Not authenticated' });
  });

  // ── Entries — list ────────────────────────────────────────────────────────────
  app.get('/api/entries', async (req) => {
    const { type, status } = req.query;
    const user_id = req.session.user.username;
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
    const user_id = req.session.user.username;

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
    const user_id = req.session.user.username;

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
    const user_id = req.session.user.username;
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
    const user_id = req.session.user.username;

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
    const user_id = req.session.user.username;
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
