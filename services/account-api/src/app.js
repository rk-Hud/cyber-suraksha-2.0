import { Hono } from 'hono';
import { randomInt, randomBytes, timingSafeEqual } from 'node:crypto';
import { configuration } from './config.js';
import { createGoogleVerifier, googleCredentialFingerprint } from './google-oidc.js';
import { createPool, transaction } from './db.js';
import { createMailer, DeliveryError, dispatchNotifications } from './mail.js';
import { digest, newToken, newId, hashPassword, verifyPassword, encryptTotp, decryptTotp, generateTotpSecret, totpStep, totpUri } from './crypto.js';
import { ApiError, fields, email, text, password, locale, identifier, version, pageNumber,
  CATEGORIES, STATUSES, TRANSITIONS, LANGUAGES, contentValue, agencies } from './validation.js';

const now = () => Math.floor(Date.now() / 1000);
const sessionLifetime = 28800;
const googleSessionLifetime = 1800;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const publicUser = user => ({ id: user.id, email: user.email, name: user.name, role: user.role,
  active: user.active, language: user.language, version: user.version, totpEnabled: Boolean(user.totp_secret) });
const publicCase = row => Object.fromEntries(['id', 'reference', 'user_id', 'subject', 'category', 'details', 'status', 'created_at', 'updated_at', 'version'].map(key => [key, row[key]]));

export function createApi(options = {}) {
  const config = options.config || configuration();
  const pool = options.pool || createPool(config);
  const mailer = createMailer(config, options.testTransport);
  if (options.googleFetcher && config.nodeEnv !== 'test') throw new Error('Test Google transport is forbidden outside tests');
  const verifyGoogleCredential = createGoogleVerifier({ fetcher: options.googleFetcher || fetch });
  const scheduleNotifications = () => {
    if (!mailer.ready || !options.schedule) return;
    // Post-response delivery is best effort. The committed outbox remains the
    // source of truth, with the protected retry action as a recovery path.
    const task = dispatchNotifications({ pool, mailer, config }, 2)
      .catch(() => { console.error('notification_dispatch_failed'); });
    try { options.schedule(task); }
    catch { console.error('notification_schedule_failed'); }
  };
  const app = new Hono();
  const hmac = (value, purpose = 'api-v1:session') => digest(purpose === 'api-v1:otp' ? config.otpKey : config.sessionKey, purpose, value);
  const ok = (c, data, status = 200) => c.json({ data, requestId: c.get('requestId') }, status);
  const fail = (c, code, status) => c.json({ error: { code }, requestId: c.get('requestId') }, status);
  const authReady = () => { if (!config.authReady) throw new ApiError('msg_service_unavailable', 503); };
  const mailReady = () => { authReady(); if (!mailer.ready) throw new ApiError('msg_mail_unavailable', 503); };
  const userQuery = 'SELECT * FROM portal_users WHERE id=$1';
  let dummyPassword;
  const dummy = () => dummyPassword ||= hashPassword('invalid-account-' + newToken());

  app.use('*', async (c, next) => {
    c.set('requestId', randomBytes(12).toString('hex'));
    c.header('X-Request-ID', c.get('requestId'));
    c.header('Cache-Control', 'no-store');
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    c.header('Strict-Transport-Security', 'max-age=31536000');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    c.header('X-Robots-Tag', 'noindex,nofollow');
    c.header('Vary', 'Origin');
    if (c.req.header('Content-Encoding') || c.req.header('Transfer-Encoding')) return fail(c, 'msg_invalid_form', 400);
    const origin = c.req.header('Origin');
    if (origin && !config.origins.includes(origin)) return fail(c, 'msg_csrf_invalid', 403);
    if (origin) c.header('Access-Control-Allow-Origin', origin);
    if (c.req.method === 'OPTIONS') {
      const requested = (c.req.header('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean);
      const method = c.req.header('Access-Control-Request-Method') || 'GET';
      if (!origin || requested.some(name => !['authorization', 'content-type'].includes(name)) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return fail(c, 'msg_forbidden', 403);
      c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      c.header('Access-Control-Max-Age', '600');
      return c.body(null, 204);
    }
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof ApiError) {
      if (c.req.path.startsWith('/api/v1/auth/google')) console.warn('google_auth_rejected', c.get('requestId'), error.code);
      return fail(c, error.code, error.status);
    }
    if (error instanceof DeliveryError) return fail(c, 'msg_mail_unavailable', 503);
    if (error?.code === '23505') return fail(c, 'msg_version_conflict', 409);
    // Database/provider messages can contain secrets or submitted data.
    console.error('api_request_failed', c.get('requestId'), error?.constructor?.name || 'Error');
    return fail(c, 'msg_request_failed', 503);
  });
  app.notFound(c => fail(c, 'msg_not_found', 404));

  async function body(c, required, optional = []) {
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(c.req.header('Content-Type') || '')) throw new ApiError('msg_invalid_form', 415);
    const declared = c.req.header('Content-Length');
    if (declared && (!/^\d{1,8}$/.test(declared) || Number(declared) > 262144)) throw new ApiError('msg_invalid_form', 413);
    const reader = c.req.raw.body?.getReader();
    if (!reader) throw new ApiError();
    const pieces = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 262144) { await reader.cancel(); throw new ApiError('msg_invalid_form', 413); }
        pieces.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length; }
      return fields(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), required, optional);
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(); }
  }
  async function rate(scope, limit, period, identity = 'public') {
    authReady();
    const window = Math.floor(now() / period) * period;
    const key = hmac(scope + '\0' + identity, 'api-v1:rate');
    const { rows } = await pool.query(`INSERT INTO portal_rate_buckets(key,"window",count) VALUES($1,$2,1)
      ON CONFLICT(key,"window") DO UPDATE SET count=portal_rate_buckets.count+1 RETURNING count`, [key, window]);
    if (rows[0].count > limit) throw new ApiError('msg_rate_limited', 429);
  }
  async function authRates(address, scope) {
    await rate(scope + ':global', 40, 60);
    await rate(scope + ':address', 6, 900, address);
  }
  async function mailRates(address) {
    await rate('mail:address', 6, 3600, address);
    await rate('mail:hour', 80, 3600);
    await rate('mail:day', 90, 86400);
  }
  async function authLock(db, address) {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['cs-api-auth:' + address]);
  }
  async function googleOnly(db, userId) {
    if (!userId) return false;
    // Existing password-only installations keep working before the additive
    // Google migration. A Google-linked account never gains a password through
    // email recovery, even if Google sign-in is temporarily disabled.
    const exists = (await db.query("SELECT to_regclass('portal_google_identities') AS relation")).rows[0].relation;
    return Boolean(exists && (await db.query('SELECT 1 FROM portal_google_identities WHERE user_id=$1', [userId])).rowCount);
  }
  async function audit(db, actor, action, record, metadata = {}) {
    await db.query('INSERT INTO portal_audit_events(id,actor_id,action,record,metadata_json,created_at) VALUES($1,$2,$3,$4,$5,$6)', [newId(), actor.id, action, record, JSON.stringify(metadata), now()]);
  }
  async function loginEvent(db, c, address, success, reason, user) {
    await db.query(`INSERT INTO portal_login_events(id,user_id,email,name,success,reason,ip_label,user_agent,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [newId(), user?.id || null, address, user?.name || '', success, reason,
      'unavailable', (c.req.header('User-Agent') || '').slice(0, 200), now()]);
  }
  async function loadAuth(c, db = pool, owner = false, mfa = true) {
    authReady();
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(c.req.header('Authorization') || '');
    if (!match) throw new ApiError('msg_authentication_required', 401);
    const { rows } = await db.query('SELECT * FROM portal_sessions WHERE token_hash=$1 AND expires_at>$2 AND user_id IS NOT NULL', [hmac(match[1]), now()]);
    const session = rows[0];
    const user = session ? (await db.query(userQuery, [session.user_id])).rows[0] : null;
    if (!user?.active) throw new ApiError('msg_authentication_required', 401);
    if (owner && (user.role !== 'owner' || user.email !== config.adminEmail)) throw new ApiError('msg_forbidden', 403);
    if (owner && mfa && (!user.totp_secret || !session.mfa_at || session.mfa_at < now() - 600)) throw new ApiError('msg_mfa_required', 403);
    return { session, user, token: match[1] };
  }
  async function revoke(db, userId) {
    // Anonymous password-validated login challenges must also be revoked.
    await db.query('DELETE FROM portal_challenges WHERE user_id=$1 OR browser_id IN (SELECT id FROM portal_sessions WHERE user_id=$1)', [userId]);
    await db.query('DELETE FROM portal_sessions WHERE user_id=$1', [userId]);
  }
  async function eraseSession(db, id) {
    await db.query('DELETE FROM portal_challenges WHERE browser_id=$1', [id]);
    await db.query('DELETE FROM portal_sessions WHERE id=$1', [id]);
  }
  async function newSession(db, userId, authenticated = true, lifetime = sessionLifetime) {
    const token = newToken(), id = newId(), expires = now() + (authenticated ? lifetime : 600);
    await db.query(`INSERT INTO portal_sessions(id,token_hash,user_id,created_at,expires_at,authenticated_at)
      VALUES($1,$2,$3,$4,$5,$6)`, [id, hmac(token), userId, now(), expires, authenticated ? now() : null]);
    return { id, token, expiresAt: expires };
  }
  function googleFlowValues(value) {
    if (typeof value.flowToken !== 'string' || !tokenPattern.test(value.flowToken) ||
        typeof value.nonce !== 'string' || !tokenPattern.test(value.nonce) ||
        typeof value.challengeId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value.challengeId)) {
      throw new ApiError('msg_invalid_credentials', 401);
    }
  }
  const googleFlowQuery = `SELECT ch.*, s.expires_at AS browser_expires FROM portal_challenges ch
    JOIN portal_sessions s ON s.id=ch.browser_id WHERE ch.id=$1 AND s.token_hash=$2
    AND s.pending_challenge=ch.id AND s.user_id IS NULL AND ch.purpose='google'`;
  function validGoogleFlow(challenge, nonce) {
    if (!challenge || challenge.consumed_at || challenge.expires_at <= now() ||
        challenge.browser_expires <= now() || challenge.attempts >= 5) return false;
    const expected = hmac(challenge.id + '\0' + challenge.browser_id + '\0google\0' + nonce, 'api-v1:otp');
    const stored = Buffer.from(challenge.code_hash);
    return stored.length === expected.length && timingSafeEqual(Buffer.from(expected), stored);
  }
  async function googleFailure(value) {
    // A bad credential consumes an attempt only for its own current flow. It
    // never creates a user or exposes the token to an application log.
    await pool.query(`UPDATE portal_challenges ch SET attempts=LEAST(ch.attempts+1,5)
      FROM portal_sessions s WHERE ch.id=$1 AND ch.browser_id=s.id AND s.token_hash=$2
      AND s.pending_challenge=ch.id AND ch.purpose='google' AND ch.consumed_at IS NULL
      AND ch.expires_at>$3 AND s.expires_at>$3 AND s.user_id IS NULL`, [value.challengeId, hmac(value.flowToken), now()]);
  }
  async function cleanupGoogleFlows(db) {
    // Keep a bounded grace period for troubleshooting counts, not token data.
    // Only expired anonymous Google flows and long-expired replay fingerprints
    // are removed; password flows, users and case records are untouched.
    const stale = (await db.query(`SELECT ch.id,ch.browser_id FROM portal_challenges ch
      JOIN portal_sessions s ON s.id=ch.browser_id WHERE ch.purpose='google' AND ch.expires_at<$1
      AND s.user_id IS NULL ORDER BY ch.expires_at LIMIT 100 FOR UPDATE OF ch,s SKIP LOCKED`, [now()-3600])).rows;
    for (const row of stale) await eraseSession(db, row.browser_id);
    await db.query(`DELETE FROM portal_google_credential_uses WHERE fingerprint IN
      (SELECT fingerprint FROM portal_google_credential_uses WHERE used_at<$1 ORDER BY used_at LIMIT 100)`, [now()-7200]);
  }
  async function issue(c, address, purpose, user, payload, language) {
    mailReady(); await mailRates(address);
    const code = String(randomInt(1000000)).padStart(6, '0'), id = newId(), expiresAt = now() + 300;
    const session = await transaction(pool, async db => {
      await authLock(db, address);
      const row = await newSession(db, null, false);
      const codeHash = hmac(id + '\0' + row.id + '\0' + purpose + '\0' + code, 'api-v1:otp');
      await db.query(`INSERT INTO portal_challenges(id,browser_id,user_id,email,purpose,code_hash,payload,created_at,expires_at,attempts)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,0)`, [id, row.id, user?.id || null, address, purpose, codeHash,
        JSON.stringify({ ...payload, language }), now(), expiresAt]);
      await db.query('UPDATE portal_sessions SET pending_challenge=$1 WHERE id=$2', [id, row.id]);
      return row;
    });
    try { await mailer.otp(address, code, language); }
    catch {
      await transaction(pool, db => eraseSession(db, session.id));
      throw new ApiError('msg_mail_unavailable', 503);
    }
    return { id, token: session.token, purpose: purpose === 'existing_register' ? 'register' : purpose, expiresAt };
  }
  async function consume(c, values, handler) {
    if (typeof values.flowToken !== 'string' || !tokenPattern.test(values.flowToken) ||
        typeof values.challengeId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(values.challengeId)) throw new ApiError('msg_code_invalid');
    const candidate = (await pool.query(`SELECT ch.email FROM portal_challenges ch JOIN portal_sessions s ON s.id=ch.browser_id
      WHERE ch.id=$1 AND s.token_hash=$2 AND s.pending_challenge=ch.id AND s.user_id IS NULL`, [values.challengeId, hmac(values.flowToken)])).rows[0];
    if (!candidate) throw new ApiError('msg_code_invalid');
    const result = await transaction(pool, async db => {
      await authLock(db, candidate.email);
      const { rows } = await db.query(`SELECT ch.*, s.expires_at AS browser_expires FROM portal_challenges ch
        JOIN portal_sessions s ON s.id=ch.browser_id WHERE ch.id=$1 AND s.token_hash=$2 AND s.pending_challenge=ch.id
        AND s.user_id IS NULL FOR UPDATE OF ch,s`, [values.challengeId, hmac(values.flowToken)]);
      const challenge = rows[0];
      if (!challenge || challenge.consumed_at || challenge.expires_at <= now() || challenge.browser_expires <= now() || challenge.attempts >= 5) return { invalid: true };
      const supplied = typeof values.code === 'string' && /^[0-9]{6}$/.test(values.code) ? values.code : 'invalid';
      const expected = hmac(challenge.id + '\0' + challenge.browser_id + '\0' + challenge.purpose + '\0' + supplied, 'api-v1:otp');
      const valid = timingSafeEqual(Buffer.from(expected), Buffer.from(challenge.code_hash));
      await db.query('UPDATE portal_challenges SET attempts=attempts+1, consumed_at=$1 WHERE id=$2', [valid ? now() : null, challenge.id]);
      if (!valid) return { invalid: true };
      return handler(db, challenge);
    });
    if (result.invalid) throw new ApiError('msg_code_invalid');
    return result;
  }
  async function addNotification(db, row, language = 'en') {
    await db.query(`INSERT INTO portal_notifications(id,user_id,complaint_id,language,status,case_status,reference,attempts,due_at,created_at)
      VALUES($1,$2,$3,$4,'pending',$5,$6,0,$7,$7)`, [newId(), row.user_id, row.id, language, row.status, row.reference, now()]);
  }
  async function caseRecord(db, id, user, lock = false) {
    identifier(id);
    const owner = user.role === 'owner' && user.email === config.adminEmail;
    const query = 'SELECT * FROM portal_complaints WHERE id=$1' + (owner ? '' : ' AND user_id=$2') + (lock ? ' FOR UPDATE' : '');
    const row = (await db.query(query, owner ? [id] : [id, user.id])).rows[0];
    if (!row) throw new ApiError('msg_not_found', 404);
    return row;
  }
  async function listing(c, table, where, args, mapper, key) {
    const page = pageNumber(c.req.query('page') || '1');
    const total = Number((await pool.query(`SELECT count(*)::int AS total FROM ${table} ${where}`, args)).rows[0].total);
    const rows = (await pool.query(`SELECT * FROM ${table} ${where} ORDER BY ${table === 'portal_users' ? 'created_at' : 'updated_at'} DESC LIMIT 20 OFFSET $${args.length + 1}`, [...args, (page - 1) * 20])).rows;
    return ok(c, { [key]: rows.map(mapper), pagination: { page, pages: Math.max(1, Math.ceil(total / 20)), total, pageSize: 20 } });
  }

  app.get('/api/v1/health', async c => {
    let database = false;
    try { await pool.query('SELECT id FROM portal_users LIMIT 1'); database = true; } catch { /* no database details in public readiness */ }
    let googleReady = false;
    if (database && config.authReady && config.googleSignIn) {
      try {
        await pool.query('SELECT i.google_sub,u.fingerprint FROM portal_google_identities i CROSS JOIN portal_google_credential_uses u LIMIT 0');
        googleReady = true;
      } catch { /* A feature is not ready until its additive schema exists. */ }
    }
    return ok(c, { status: database ? 'ok' : 'unavailable', googleClientId: googleReady ? config.googleClientId : '', features: {
      registration: database && config.authReady && mailer.ready && config.registrationEnabled,
      emailOtp: database && config.authReady && mailer.ready,
      googleSignIn: googleReady,
      googleRegistration: googleReady && config.googleRegistration,
      complaints: database && config.authReady, admin: database && config.authReady && config.totpKey.length >= 32,
    } }, database ? 200 : 503);
  });
  app.get('/health', c => app.fetch(new Request(new URL('/api/v1/health', c.req.url), { headers: c.req.raw.headers })));
  app.get('/api/v1/public/content', async c => {
    const { rows } = await pool.query('SELECT section,content,version FROM portal_site_content ORDER BY section');
    return ok(c, { sections: rows });
  });
  app.post('/api/v1/auth/register', async c => {
    const value = await body(c, ['name', 'email', 'password', 'confirmPassword', 'consent'], ['locale']);
    const address = email(value.email), language = locale(value.locale);
    if (!config.registrationEnabled && address !== config.adminEmail) throw new ApiError('msg_registration_closed', 403);
    mailReady();
    const name = text(value.name, 2, 100, 'msg_name_invalid');
    password(value.password, value.confirmPassword);
    if (value.consent !== true) throw new ApiError('msg_consent_required');
    await authRates(address, 'register');
    const user = (await pool.query('SELECT * FROM portal_users WHERE email=$1', [address])).rows[0];
    const payload = user ? {} : { name, password_hash: await hashPassword(value.password) };
    return ok(c, { challenge: await issue(c, address, user ? 'existing_register' : 'register', user, payload, language) });
  });

  // The browser requests a fresh server-bound nonce before starting GIS. Both
  // the opaque flow token and signed nonce must survive only in that page.
  app.post('/api/v1/auth/google/challenge', async c => {
    if (!config.googleSignIn) throw new ApiError('msg_service_unavailable', 503);
    const value = await body(c, [], ['locale']);
    const language = locale(value.locale);
    await rate('google:challenge', 40, 60);
    const id = newId(), nonce = newToken(), expiresAt = now() + 300;
    const session = await transaction(pool, async db => {
      await cleanupGoogleFlows(db);
      const session = await newSession(db, null, false);
      const codeHash = hmac(id + '\0' + session.id + '\0google\0' + nonce, 'api-v1:otp');
      await db.query(`INSERT INTO portal_challenges(id,browser_id,user_id,email,purpose,code_hash,payload,created_at,expires_at,attempts)
        VALUES($1,$2,NULL,'','google',$3,$4,$5,$6,0)`, [id, session.id, codeHash, JSON.stringify({ language }), now(), expiresAt]);
      await db.query('UPDATE portal_sessions SET pending_challenge=$1 WHERE id=$2', [id, session.id]);
      return session;
    });
    return ok(c, { challenge: { id, token: session.token, nonce, purpose: 'google', expiresAt } });
  });

  // Federated sign-in is citizen-only. A matching email never links a password
  // account; only Google's stable subject identifies an existing Google user.
  app.post('/api/v1/auth/google', async c => {
    if (!config.googleSignIn) throw new ApiError('msg_service_unavailable', 503);
    const value = await body(c, ['credential', 'nonce', 'challengeId', 'flowToken'], ['locale', 'consent']);
    googleFlowValues(value);
    await rate('google:global', 40, 60);
    const pending = (await pool.query(googleFlowQuery, [value.challengeId, hmac(value.flowToken)])).rows[0];
    if (!validGoogleFlow(pending, value.nonce)) {
      await googleFailure(value);
      throw new ApiError('msg_invalid_credentials', 401);
    }
    let google;
    try { google = await verifyGoogleCredential(value.credential, { clientId: config.googleClientId, nonce: value.nonce }); }
    catch {
      await googleFailure(value);
      throw new ApiError('msg_invalid_credentials', 401);
    }
    let address;
    try { address = email(google.email); } catch { throw new ApiError('msg_invalid_credentials', 401); }
    if (address === config.adminEmail) throw new ApiError('msg_forbidden', 403);
    if (config.googleAllowedEmails.length && !config.googleAllowedEmails.includes(address)) throw new ApiError('msg_forbidden', 403);
    await rate('google:address', 6, 900, address);
    const language = locale(value.locale ?? pending.payload.language);
    const fingerprint = googleCredentialFingerprint(value.credential);
    let displayName;
    try { displayName = text(google.name, 2, 100, 'msg_name_invalid'); }
    catch { displayName = 'Citizen'; }
    const result = await transaction(pool, async db => {
      await authLock(db, address);
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['cs-api-google-sub:' + google.subject]);
      const challenge = (await db.query(googleFlowQuery + ' FOR UPDATE OF ch,s', [value.challengeId, hmac(value.flowToken)])).rows[0];
      if (!validGoogleFlow(challenge, value.nonce)) throw new ApiError('msg_invalid_credentials', 401);
      const inserted = await db.query('INSERT INTO portal_google_credential_uses(fingerprint,used_at) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING fingerprint', [fingerprint, now()]);
      if (!inserted.rowCount) throw new ApiError('msg_invalid_credentials', 401);
      const binding = (await db.query('SELECT user_id FROM portal_google_identities WHERE google_sub=$1 FOR UPDATE', [google.subject])).rows[0];
      let user;
      if (binding) {
        user = (await db.query(userQuery + ' FOR UPDATE', [binding.user_id])).rows[0];
        if (!user?.active || user.role !== 'citizen' || user.email === config.adminEmail) throw new ApiError('msg_invalid_credentials', 401);
      } else {
        if (!config.googleRegistration) throw new ApiError('msg_registration_closed', 403);
        if (value.consent !== true) throw new ApiError('msg_consent_required', 422);
        if ((await db.query('SELECT id FROM portal_users WHERE email=$1', [address])).rowCount) {
          throw new ApiError('msg_invalid_credentials', 409);
        }
        const passwordHash = await hashPassword('unusable-google-only-' + newToken());
        const created = await db.query(`INSERT INTO portal_users
          (id,email,name,password_hash,language,role,active,verified_at,created_at,updated_at,version,totp_last_step)
          VALUES($1,$2,$3,$4,$5,'citizen',true,$6,$6,$6,1,-1) RETURNING *`,
          [newId(),address,displayName,passwordHash,language,now()]);
        user = created.rows[0];
        await db.query('INSERT INTO portal_google_identities(google_sub,user_id,linked_at) VALUES($1,$2,$3)', [google.subject,user.id,now()]);
      }
      await loginEvent(db, c, user.email, true, 'google_verified_oidc', user);
      const session = await newSession(db, user.id, true, googleSessionLifetime);
      await eraseSession(db, challenge.browser_id);
      return { token: session.token, user: publicUser(user), expiresAt: session.expiresAt };
    });
    return ok(c, result);
  });

  app.post('/api/v1/auth/login', async c => {
    const value = await body(c, ['email', 'password'], ['locale']);
    const address = email(value.email), language = locale(value.locale);
    mailReady(); await authRates(address, 'login');
    const user = (await pool.query('SELECT * FROM portal_users WHERE email=$1', [address])).rows[0];
    const valid = typeof value.password === 'string' && value.password.length <= 128 && await verifyPassword(value.password, user?.password_hash || await dummy());
    if (!valid || !user?.active || await googleOnly(pool, user.id)) {
      await loginEvent(pool, c, address, false, 'credentials_rejected', user);
      throw new ApiError('msg_invalid_credentials', 401);
    }
    // A reset may complete while password derivation is running. Bind this
    // challenge to the credential version that actually passed verification.
    return ok(c, { challenge: await issue(c, address, 'login', user, { userVersion: user.version }, language) });
  });
  app.post('/api/v1/auth/verify', async c => {
    const value = await body(c, ['challengeId', 'flowToken', 'code']);
    mailReady(); await rate('verify:global', 60, 60);
    const result = await consume(c, value, async (db, challenge) => {
      if (!['register', 'existing_register', 'login'].includes(challenge.purpose)) return { invalid: true };
      if (challenge.purpose === 'existing_register') { await eraseSession(db, challenge.browser_id); return { loginRequired: true }; }
      let user = challenge.user_id ? (await db.query(userQuery + ' FOR UPDATE', [challenge.user_id])).rows[0] : null;
      if (challenge.purpose === 'login' && (!user || challenge.payload.userVersion !== user.version || await googleOnly(db, user.id))) {
        await eraseSession(db, challenge.browser_id);
        return { invalid: true };
      }
      if (challenge.purpose === 'register') {
        const existing = (await db.query('SELECT id FROM portal_users WHERE email=$1', [challenge.email])).rows[0];
        if (existing) { await eraseSession(db, challenge.browser_id); return { loginRequired: true }; }
        const payload = challenge.payload;
        const { rows } = await db.query(`INSERT INTO portal_users(id,email,name,password_hash,language,role,active,verified_at,created_at,updated_at,version,totp_last_step)
          VALUES($1,$2,$3,$4,$5,$6,true,$7,$7,$7,1,-1) RETURNING *`, [newId(), challenge.email,
          payload.name, payload.password_hash, payload.language, challenge.email === config.adminEmail ? 'owner' : 'citizen', now()]);
        user = rows[0];
      }
      if (!user?.active) throw new ApiError('msg_invalid_credentials', 401);
      await db.query('UPDATE portal_users SET language=$1 WHERE id=$2', [challenge.payload.language, user.id]);
      user.language = challenge.payload.language;
      await loginEvent(db, c, user.email, true, 'password_and_email_otp', user);
      const session = await newSession(db, user.id);
      await eraseSession(db, challenge.browser_id);
      return { token: session.token, user: publicUser(user), expiresAt: session.expiresAt };
    });
    return ok(c, result);
  });
  app.post('/api/v1/auth/forgot', async c => {
    const value = await body(c, ['email'], ['locale']);
    const address = email(value.email), language = locale(value.locale);
    mailReady(); await authRates(address, 'forgot');
    const user = (await pool.query('SELECT * FROM portal_users WHERE email=$1 AND active=true', [address])).rows[0];
    const recoverable = user && !await googleOnly(pool, user.id) ? user : null;
    return ok(c, { challenge: await issue(c, address, 'reset', recoverable, {}, language) });
  });
  app.post('/api/v1/auth/reset', async c => {
    const value = await body(c, ['challengeId', 'flowToken', 'code', 'password', 'confirmPassword']);
    mailReady(); password(value.password, value.confirmPassword); await rate('reset:global', 30, 60);
    const chosen = await hashPassword(value.password);
    await consume(c, value, async (db, challenge) => {
      if (challenge.purpose !== 'reset') return { invalid: true };
      const user = challenge.user_id ? (await db.query(userQuery + ' FOR UPDATE', [challenge.user_id])).rows[0] : null;
      if (user?.active && !await googleOnly(db, user.id)) {
        await db.query('UPDATE portal_users SET password_hash=$1, updated_at=$2, version=version+1 WHERE id=$3', [chosen, now(), user.id]);
        await revoke(db, user.id);
      }
      await eraseSession(db, challenge.browser_id);
      return { reset: true };
    });
    return ok(c, { reset: true });
  });
  app.get('/api/v1/auth/me', async c => {
    const { user, session } = await loadAuth(c);
    return ok(c, { user: publicUser(user), expiresAt: session.expires_at, mfaVerified: Boolean(session.mfa_at && session.mfa_at >= now() - 600) });
  });
  app.post('/api/v1/auth/logout', async c => {
    await body(c, []);
    await transaction(pool, async db => { const { session } = await loadAuth(c, db); await eraseSession(db, session.id); });
    return ok(c, { loggedOut: true });
  });
  app.get('/api/v1/cases', async c => {
    const { user } = await loadAuth(c);
    return listing(c, 'portal_complaints', 'WHERE user_id=$1', [user.id], publicCase, 'cases');
  });
  app.post('/api/v1/cases', async c => {
    const value = await body(c, ['subject', 'category', 'details', 'consent']);
    const subject = text(value.subject, 5, 160, 'msg_subject_invalid'), details = text(value.details, 20, 5000, 'msg_details_invalid');
    if (!CATEGORIES.includes(value.category)) throw new ApiError();
    if (value.consent !== true) throw new ApiError('msg_consent_required');
    const auth = await loadAuth(c); await rate('cases:new', 10, 3600, auth.user.id);
    const row = await transaction(pool, async db => {
      const { user } = await loadAuth(c, db);
      const { rows } = await db.query(`INSERT INTO portal_complaints(id,reference,user_id,subject,category,details,status,consent_at,created_at,updated_at,version)
        VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$7,$7,1) RETURNING *`, [newId(), 'CS-' + randomBytes(6).toString('hex').toUpperCase(), user.id, subject, value.category, details, now()]);
      const row = rows[0];
      await db.query(`INSERT INTO portal_case_events(id,complaint_id,actor_id,sequence,author_role,author_name,message,old_status,new_status,created_at)
        VALUES($1,$2,$3,1,'citizen',$4,$5,NULL,'pending',$6)`, [newId(), row.id, user.id, user.name, details, now()]);
      await addNotification(db, row, user.language);
      return row;
    });
    scheduleNotifications();
    return ok(c, { case: publicCase(row) }, 201);
  });
  app.get('/api/v1/cases/:id', async c => {
    const auth = await loadAuth(c);
    if (auth.user.role === 'owner') await loadAuth(c, pool, true);
    const row = await caseRecord(pool, c.req.param('id'), auth.user);
    const events = (await pool.query('SELECT id,sequence,author_role,author_name,message,old_status,new_status,created_at FROM portal_case_events WHERE complaint_id=$1 ORDER BY sequence', [row.id])).rows;
    const owner = auth.user.role === 'owner' ? (await pool.query('SELECT name,email FROM portal_users WHERE id=$1', [row.user_id])).rows[0] : undefined;
    return ok(c, { case: publicCase(row), events, ...(owner ? { owner } : {}) });
  });
  app.post('/api/v1/cases/:id/replies', async c => {
    const value = await body(c, ['message']); const message = text(value.message, 3, 3000, 'msg_details_invalid');
    const initial = await loadAuth(c); await rate('cases:reply', 20, 3600, initial.user.id);
    const row = await transaction(pool, async db => {
      const { user } = await loadAuth(c, db);
      if (user.role === 'owner') throw new ApiError('msg_forbidden', 403);
      const row = await caseRecord(db, c.req.param('id'), user, true);
      if (row.status === 'closed') throw new ApiError('msg_forbidden', 403);
      const old = row.status;
      if (row.status === 'awaiting_info') row.status = 'in_review';
      row.version++;
      row.updated_at = now();
      await db.query('UPDATE portal_complaints SET status=$1,version=$2,updated_at=$3 WHERE id=$4', [row.status, row.version, row.updated_at, row.id]);
      await db.query(`INSERT INTO portal_case_events(id,complaint_id,actor_id,sequence,author_role,author_name,message,old_status,new_status,created_at)
        VALUES($1,$2,$3,$4,'citizen',$5,$6,$7,$8,$9)`, [newId(), row.id, user.id, row.version, user.name, message, old, row.status, now()]);
      if (old !== row.status) await addNotification(db, row, user.language);
      return row;
    });
    scheduleNotifications();
    return ok(c, { case: publicCase(row) });
  });

  app.post('/api/v1/admin/mfa/start', async c => {
    await body(c, []);
    if (config.totpKey.length < 32) throw new ApiError('msg_service_unavailable', 503);
    const initial = await loadAuth(c, pool, true, false); await rate('mfa:setup', 6, 300, initial.user.id);
    const secret = generateTotpSecret();
    await transaction(pool, async db => {
      await authLock(db, initial.user.email);
      const { user, session } = await loadAuth(c, db, true, false);
      const locked = (await db.query(userQuery + ' FOR UPDATE', [user.id])).rows[0];
      if (locked.totp_secret) throw new ApiError('msg_forbidden', 403);
      if (!session.authenticated_at || session.authenticated_at < now() - 600) throw new ApiError('msg_mfa_required', 403);
      await db.query('UPDATE portal_sessions SET pending_totp_secret=$1,pending_totp_expires=$2 WHERE id=$3', [encryptTotp(secret, config.totpKey), now() + 600, session.id]);
    });
    return ok(c, { secret, uri: totpUri(secret, initial.user.email), expiresAt: now() + 600 });
  });
  app.post('/api/v1/admin/mfa/confirm', async c => {
    const value = await body(c, ['code']);
    if (config.totpKey.length < 32) throw new ApiError('msg_service_unavailable', 503);
    const initial = await loadAuth(c, pool, true, false); await rate('mfa:setup', 6, 300, initial.user.id);
    await transaction(pool, async db => {
      await authLock(db, initial.user.email);
      const { user, session } = await loadAuth(c, db, true, false);
      const locked = (await db.query(userQuery + ' FOR UPDATE', [user.id])).rows[0];
      if (locked.totp_secret) throw new ApiError('msg_forbidden', 403);
      if (!session.authenticated_at || session.authenticated_at < now() - 600 || !session.pending_totp_secret || session.pending_totp_expires < now()) throw new ApiError('msg_mfa_invalid');
      let secret; try { secret = decryptTotp(session.pending_totp_secret, config.totpKey); } catch { throw new ApiError('msg_service_unavailable', 503); }
      const step = totpStep(value.code, secret);
      if (step === null) throw new ApiError('msg_mfa_invalid');
      await db.query('UPDATE portal_users SET totp_secret=$1,totp_last_step=$2 WHERE id=$3', [session.pending_totp_secret, step, user.id]);
      await db.query('UPDATE portal_sessions SET pending_totp_secret=NULL,pending_totp_expires=NULL,mfa_at=$1 WHERE id=$2', [now(), session.id]);
      await audit(db, user, 'mfa.enabled', user.id);
    });
    return ok(c, { mfaVerified: true });
  });
  app.post('/api/v1/admin/mfa/verify', async c => {
    const value = await body(c, ['code']);
    if (config.totpKey.length < 32) throw new ApiError('msg_service_unavailable', 503);
    const initial = await loadAuth(c, pool, true, false); await rate('mfa:verify', 6, 300, initial.user.id);
    await transaction(pool, async db => {
      await authLock(db, initial.user.email);
      const { user, session } = await loadAuth(c, db, true, false);
      const locked = (await db.query(userQuery + ' FOR UPDATE', [user.id])).rows[0];
      let secret; try { secret = locked.totp_secret ? decryptTotp(locked.totp_secret, config.totpKey) : null; } catch { throw new ApiError('msg_service_unavailable', 503); }
      const step = secret ? totpStep(value.code, secret, locked.totp_last_step) : null;
      if (step === null) throw new ApiError('msg_mfa_invalid');
      await db.query('UPDATE portal_users SET totp_last_step=$1 WHERE id=$2', [step, user.id]);
      await db.query('UPDATE portal_sessions SET mfa_at=$1 WHERE id=$2', [now(), session.id]);
      await audit(db, user, 'mfa.verified', user.id);
    });
    return ok(c, { mfaVerified: true });
  });
  app.get('/api/v1/admin/summary', async c => {
    await loadAuth(c, pool, true);
    const grouped = (await pool.query('SELECT status,count(*)::int AS count FROM portal_complaints GROUP BY status')).rows;
    const statuses = Object.fromEntries(grouped.map(row => [row.status, row.count]));
    const counts = { pending: statuses.pending || 0, inReview: statuses.in_review || 0, awaitingInfo: statuses.awaiting_info || 0,
      resolved: statuses.resolved || 0, closed: statuses.closed || 0,
      users: Number((await pool.query('SELECT count(*)::int AS count FROM portal_users')).rows[0].count),
      notifications: Number((await pool.query("SELECT count(*)::int AS count FROM portal_notifications WHERE status IN ('pending','sending','dead')")).rows[0].count) };
    const logins = (await pool.query('SELECT email,name,success,reason,ip_label,created_at FROM portal_login_events ORDER BY created_at DESC LIMIT 100')).rows;
    const audit = (await pool.query('SELECT action,record,metadata_json,created_at FROM portal_audit_events ORDER BY created_at DESC LIMIT 100')).rows;
    return ok(c, { counts, logins, audit });
  });
  app.get('/api/v1/admin/users', async c => {
    await loadAuth(c, pool, true); return listing(c, 'portal_users', '', [], publicUser, 'users');
  });
  app.patch('/api/v1/admin/users/:id', async c => {
    const value = await body(c, ['active', 'version']);
    if (typeof value.active !== 'boolean') throw new ApiError(); version(value.version); identifier(c.req.param('id'));
    const updated = await transaction(pool, async db => {
      const { user: actor } = await loadAuth(c, db, true);
      const user = (await db.query(userQuery + ' FOR UPDATE', [c.req.param('id')])).rows[0];
      if (!user) throw new ApiError('msg_not_found', 404);
      if (user.role === 'owner' || user.id === actor.id) throw new ApiError('msg_forbidden', 403);
      if (user.version !== value.version) throw new ApiError('msg_version_conflict', 409);
      user.active = value.active; user.version++;
      await db.query('UPDATE portal_users SET active=$1,version=$2,updated_at=$3 WHERE id=$4', [user.active, user.version, now(), user.id]);
      if (!user.active) await revoke(db, user.id);
      await audit(db, actor, 'user.active', user.id, { active: user.active, version: user.version });
      return user;
    });
    return ok(c, { user: publicUser(updated) });
  });
  app.get('/api/v1/admin/cases', async c => {
    await loadAuth(c, pool, true); return listing(c, 'portal_complaints', '', [], publicCase, 'cases');
  });
  app.patch('/api/v1/admin/cases/:id', async c => {
    const value = await body(c, ['status', 'message', 'version']); version(value.version);
    if (!STATUSES.includes(value.status)) throw new ApiError();
    const message = text(value.message, 3, 3000, 'msg_details_invalid');
    const row = await transaction(pool, async db => {
      const { user } = await loadAuth(c, db, true);
      const row = await caseRecord(db, c.req.param('id'), user, true);
      if (row.version !== value.version) throw new ApiError('msg_version_conflict', 409);
      if (value.status !== row.status && !TRANSITIONS[row.status].includes(value.status)) throw new ApiError('msg_invalid_transition');
      const old = row.status; row.status = value.status; row.version++; row.updated_at = now();
      await db.query('UPDATE portal_complaints SET status=$1,version=$2,updated_at=$3 WHERE id=$4', [row.status, row.version, row.updated_at, row.id]);
      await db.query(`INSERT INTO portal_case_events(id,complaint_id,actor_id,sequence,author_role,author_name,message,old_status,new_status,created_at)
        VALUES($1,$2,$3,$4,'owner',$5,$6,$7,$8,$9)`, [newId(), row.id, user.id, row.version, user.name, message, old, row.status, now()]);
      const citizen = (await db.query(userQuery, [row.user_id])).rows[0];
      await addNotification(db, row, citizen.language);
      await audit(db, user, 'case.updated', row.id, { previous_status: old, status: row.status, version: row.version });
      return row;
    });
    scheduleNotifications();
    return ok(c, { case: publicCase(row) });
  });
  app.get('/api/v1/admin/content', async c => {
    await loadAuth(c, pool, true);
    return ok(c, { sections: (await pool.query('SELECT section,content,version FROM portal_site_content ORDER BY section')).rows });
  });
  app.put('/api/v1/admin/content/:section', async c => {
    const value = await body(c, ['content', 'version']); version(value.version);
    const section = c.req.param('section'), content = contentValue(section, value.content);
    const result = await transaction(pool, async db => {
      const { user } = await loadAuth(c, db, true);
      const row = (await db.query('SELECT * FROM portal_site_content WHERE section=$1 FOR UPDATE', [section])).rows[0];
      if (!row) throw new ApiError('msg_not_found', 404);
      if (row.version !== value.version) throw new ApiError('msg_version_conflict', 409);
      row.version++;
      await db.query('UPDATE portal_site_content SET content=$1,version=$2,updated_at=$3 WHERE section=$4', [JSON.stringify(content), row.version, now(), section]);
      await audit(db, user, 'content.updated', section, { version: row.version });
      return { section, content, version: row.version };
    });
    return ok(c, result);
  });
  app.post('/api/v1/admin/notifications/send-one', async c => {
    await body(c, []);
    const { user } = await loadAuth(c, pool, true); await rate('notifications:send', 6, 300, user.id);
    return ok(c, { sent: await dispatchNotifications({ pool, mailer, config }, 1) });
  });

  return { app, pool, config, mailer };
}

export async function seedContent(pool) {
  const defaults = { copy_en: {}, copy_hi: {}, copy_te: {}, resources: agencies,
    advisory: { active: false, priority: 'normal', text: { en: '', hi: '', te: '' } },
    branding: { title: 'CYBER SURAKSHA 2.0', logo_url: '/static/img/cs-logo.svg', tagline: {
      en: 'Learn · verify · respond', hi: 'सीखें · जाँचें · कार्रवाई करें', te: 'నేర్చుకోండి · ధృవీకరించండి · స్పందించండి' } } };
  for (const [section, content] of Object.entries(defaults)) await pool.query(`INSERT INTO portal_site_content(section,content,version,updated_at)
    VALUES($1,$2,1,$3) ON CONFLICT(section) DO NOTHING`, [section, JSON.stringify(content), now()]);
}
