// Migration candidate only — NOT deployed. No public complaint processing until reviewed.
import { Hono } from 'hono';
import { Pool } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { randomUUID } from 'node:crypto';

const required = ['DATABASE_URL', 'NEON_AUTH_JWKS_URL', 'NEON_AUTH_BASE_URL', 'CORS_ORIGIN'];
for (const name of required) if (!process.env[name]) throw new Error('Missing required backend setting: ' + name);
const origin = new URL(process.env.CORS_ORIGIN).origin;
if (origin !== process.env.CORS_ORIGIN || !origin.startsWith('https://')) {
  throw new Error('CORS_ORIGIN must be one exact HTTPS origin');
}
const jwks = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000 });
const app = new Hono();
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Cache-Control', 'no-store');
  c.header('Vary', 'Origin');
  const requestOrigin = c.req.header('Origin');
  if (requestOrigin && requestOrigin !== origin) return c.json({ error: 'origin_denied' }, 403);
  if (requestOrigin === origin) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
});
app.get('/health', c => c.json({ status: 'staging', accepts_real_complaints: false }));
app.use('/v1/*', async (c, next) => {
  const header = c.req.header('Authorization') || '';
  const match = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(header);
  if (!match) return c.json({ error: 'authentication_required' }, 401);
  try {
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: new URL(process.env.NEON_AUTH_BASE_URL).origin,
      algorithms: ['EdDSA'], clockTolerance: 10
    });
    if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('Missing subject');
    c.set('authId', payload.sub);
    await next();
  } catch {
    return c.json({ error: 'invalid_or_expired_session' }, 401);
  }
});
function authId(c) { return c.get('authId'); }
async function isAdmin(authId) {
  const r = await pool.query(
    'SELECT 1 FROM cs2_admin_allowlist WHERE auth_id=$1 AND revoked_at IS NULL', [authId]
  );
  return r.rowCount === 1;
}
app.get('/v1/me', async c => c.json({ authenticated: true, admin: await isAdmin(authId(c)) }));
const categories = new Set(['phishing','payment-fraud','account-takeover','impersonation','other']);
app.post('/v1/cases', async c => {
  // Deliberately disabled until privacy, abuse controls and release tests pass.
  if (process.env.ALLOW_TEST_CASES !== '1') return c.json({ error: 'intake_not_enabled' }, 503);
  if (!(c.req.header('content-type') || '').toLowerCase().startsWith('application/json')) {
    return c.json({ error: 'expected_json' }, 415);
  }
  const raw = await c.req.text();
  if (raw.length > 6000) return c.json({ error: 'request_too_large' }, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return c.json({ error: 'invalid_json' }, 400); }
  const category = input?.category, description = input?.description;
  if (!categories.has(category) || typeof description !== 'string' ||
      description.trim().length < 20 || description.trim().length > 3000) {
    return c.json({ error: 'invalid_case_fields' }, 422);
  }
  const user = authId(c);
  const recent = await pool.query(
    "SELECT count(*)::int AS total FROM cs2_cases WHERE owner_auth_id=$1 AND created_at > now() - interval '1 hour'",
    [user]
  );
  if (recent.rows[0].total >= 3) return c.json({ error: 'submission_limit' }, 429);
  const reference = 'CS2-' + randomUUID().slice(0,12).toUpperCase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      'INSERT INTO cs2_cases(owner_auth_id,reference,category,description) VALUES ($1,$2,$3,$4) RETURNING id,reference,category,status,created_at',
      [user, reference, category, description.trim()]
    );
    await client.query(
      "INSERT INTO cs2_case_events(case_id,actor_auth_id,event_type,new_status) VALUES($1,$2,'created','received')",
      [inserted.rows[0].id,user]
    );
    await client.query('COMMIT');
    return c.json({ case: inserted.rows[0] }, 201);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});
app.get('/v1/cases', async c => {
  const rows = await pool.query(
    'SELECT id,reference,category,status,created_at,updated_at FROM cs2_cases WHERE owner_auth_id=$1 ORDER BY created_at DESC LIMIT 50',
    [authId(c)]
  );
  return c.json({ cases: rows.rows });
});
app.get('/v1/cases/:id', async c => {
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'not_found' }, 404);
  const r = await pool.query(
    'SELECT id,reference,category,description,status,created_at,updated_at FROM cs2_cases WHERE id=$1 AND owner_auth_id=$2',
    [id,authId(c)]
  );
  return r.rowCount ? c.json({ case: r.rows[0] }) : c.json({ error: 'not_found' }, 404);
});
app.get('/v1/admin/cases', async c => {
  if (!await isAdmin(authId(c))) return c.json({ error: 'forbidden' }, 403);
  const r = await pool.query(
    'SELECT id,reference,category,status,created_at,updated_at FROM cs2_cases ORDER BY created_at DESC LIMIT 100'
  );
  return c.json({ cases: r.rows });
});
app.patch('/v1/admin/cases/:id', async c => {
  if (!await isAdmin(authId(c))) return c.json({ error: 'forbidden' }, 403);
  if (process.env.ALLOW_ADMIN_WRITES !== '1') return c.json({ error: 'admin_writes_not_enabled' }, 503);
  const id = c.req.param('id');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: 'not_found' }, 404);
  let input;
  try { input = await c.req.json(); } catch { return c.json({ error: 'invalid_json' }, 400); }
  if (!['received','in_review','closed'].includes(input?.status)) return c.json({ error: 'invalid_status' }, 422);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT status FROM cs2_cases WHERE id=$1 FOR UPDATE',[id]);
    if (!current.rowCount) { await client.query('ROLLBACK'); return c.json({ error: 'not_found' }, 404); }
    if (current.rows[0].status === input.status) {
      await client.query('ROLLBACK'); return c.json({ error: 'unchanged_status' }, 409);
    }
    const updated = await client.query(
      'UPDATE cs2_cases SET status=$1,updated_at=now() WHERE id=$2 RETURNING id,reference,status,updated_at',
      [input.status,id]
    );
    await client.query(
      "INSERT INTO cs2_case_events(case_id,actor_auth_id,event_type,previous_status,new_status) VALUES ($1,$2,'status_changed',$3,$4)",
      [id,authId(c),current.rows[0].status,input.status]
    );
    await client.query('COMMIT');
    return c.json({ case: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
});
app.onError((error,c) => {
  console.error('API error:',error?.name || 'unknown');
  return c.json({ error: 'internal_error' }, 500);
});
export default app;
