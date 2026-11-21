/**
 * Isolated, opt-in staging operator Function. Never import this entrypoint into
 * the citizen Function. It cannot create an owner without a preapproved,
 * Google-verified subject, a private bootstrap key and an actual TOTP code.
 * No database mutation happens merely by importing this module.
 */
import { Hono } from 'hono';
import { createHash, timingSafeEqual } from 'node:crypto';
import { configuration, normalizeEmail } from './config.js';
import { createGoogleVerifier, googleCredentialFingerprint } from './google-oidc.js';
import { createPool, transaction } from './db.js';
import { digest, newId, newToken, encryptTotp, decryptTotp,
  generateTotpSecret, hashPassword, verifyPassword, totpStep, totpUri } from './crypto.js';
import { ApiError, fields, password } from './validation.js';

const now = () => Math.floor(Date.now() / 1000);
const BRANCH = 'br-sweet-band-azhwai4r';
const identifier = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const hexEqual = (a, b) => typeof a === 'string' && typeof b === 'string'
  && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
class OperatorError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const reject = (code = 'operator_invalid', status = 401) => { throw new OperatorError(code, status); };

function operatorSettings(env, config) {
  let approvedEmail = '';
  try { approvedEmail = normalizeEmail(env.STAGING_OWNER_EMAIL || ''); }
  catch { /* Missing or invalid private owner approval fails closed. */ }
  const adminEmail = config.adminEmail;
  const enabled = env.STAGING_OPERATOR_ENABLED === '1'
    && env.STAGING_BRANCH_ID === BRANCH
    && env.STAGING_OWNER_GOOGLE_SUB && /^[0-9]{8,32}$/.test(env.STAGING_OWNER_GOOGLE_SUB)
    && approvedEmail === adminEmail
    && config.googleClientId
    && config.authReady
    && config.totpKey.length >= 48
    && config.sessionKey.length >= 48
    && config.otpKey.length >= 48
    && typeof env.STAGING_OPERATOR_APPROVAL_KEY === 'string'
    && env.STAGING_OPERATOR_APPROVAL_KEY.length >= 48
    && env.STAGING_OPERATOR_APPROVAL_KEY !== config.totpKey
    && env.STAGING_OPERATOR_APPROVAL_KEY !== config.sessionKey
    && env.STAGING_OPERATOR_APPROVAL_KEY !== config.otpKey
    && config.sessionKey !== config.totpKey
    && config.otpKey !== config.totpKey
    && [env.API_SESSION_KEY, env.API_OTP_KEY, env.TOTP_ENCRYPTION_KEY]
      .filter(Boolean).every(key =>
        ![config.sessionKey, config.otpKey, config.totpKey,
          env.STAGING_OPERATOR_APPROVAL_KEY].includes(key));
  return { enabled: Boolean(enabled), subject: env.STAGING_OWNER_GOOGLE_SUB, email: approvedEmail };
}

export function createStagingOperator(options = {}) {
  const env = options.env || process.env;
  const baseConfig = options.config || configuration(env);
  // Operator-only credentials are NEVER aliases of the citizen Function's keys.
  // Avoid accepting an operator login with a citizen signature, or vice versa.
  const config = {
    ...baseConfig,
    sessionKey: env.STAGING_OPERATOR_SESSION_KEY || '',
    otpKey: env.STAGING_OPERATOR_OTP_KEY || '',
    totpKey: env.STAGING_OPERATOR_TOTP_KEY || '',
  };
  config.authReady = config.sessionKey.length >= 48 && config.otpKey.length >= 48
    && config.sessionKey !== config.otpKey;
  if (options.googleVerifier && config.nodeEnv !== 'test') throw new Error('Only tests may inject Google verification');
  const settings = operatorSettings(env, config);
  const pool = options.pool || createPool(config);
  const verifyGoogle = options.googleVerifier || createGoogleVerifier();
  const app = new Hono();
  const safe = (c, data, status = 200) => c.json({ data }, status);
  const failure = (c, code, status) => c.json({ error: { code } }, status);
  const hashed = (purpose, value) => digest(config.otpKey, 'operator:' + purpose, value);
  const secureApproval = value => {
    const expected = hashed('approval', env.STAGING_OPERATOR_APPROVAL_KEY || '');
    if (typeof value !== 'string' || value.length > 512 || !hexEqual(hashed('approval', value), expected)) reject();
  };
  const ready = () => { if (!settings.enabled) reject('operator_disabled', 503); };

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Strict-Transport-Security', 'max-age=31536000');
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    c.header('X-Robots-Tag', 'noindex,nofollow');
    c.header('Vary', 'Origin');
    if (c.req.header('Content-Encoding') || c.req.header('Transfer-Encoding')) return failure(c, 'operator_invalid', 400);
    const origin = c.req.header('Origin');
    if (origin && !config.origins.includes(origin)) return failure(c, 'operator_forbidden', 403);
    if (origin) c.header('Access-Control-Allow-Origin', origin);
    if (c.req.method === 'OPTIONS') {
      const requested = (c.req.header('Access-Control-Request-Headers') || '').toLowerCase()
        .split(',').map(x => x.trim()).filter(Boolean);
      const method = c.req.header('Access-Control-Request-Method') || '';
      if (!origin || !['POST', 'GET', 'PATCH'].includes(method)
        || requested.some(x => !['content-type', 'authorization'].includes(x))) {
        return failure(c, 'operator_forbidden', 403);
      }
      c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return c.body(null, 204);
    }
    await next();
  });
  app.onError((error, c) => {
    if (error instanceof OperatorError) return failure(c, error.code, error.status);
    if (error instanceof ApiError) return failure(c, 'operator_invalid', error.status);
    // Never log request bodies, JWTs, credentials, emails or provider SQL text.
    console.error('staging_operator_failed', error?.constructor?.name || 'Error');
    return failure(c, 'operator_unavailable', 503);
  });
  app.notFound(c => failure(c, 'operator_not_found', 404));
  async function body(c, required) {
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(c.req.header('Content-Type') || ''))
      reject('operator_invalid', 415);
    const declared = c.req.header('Content-Length');
    if (declared && (!/^[0-9]{1,6}$/.test(declared) || +declared > 16384))
      reject('operator_invalid', 413);
    const reader = c.req.raw.body?.getReader();
    if (!reader) reject('operator_invalid', 400);
    const chunks = []; let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); reject('operator_invalid', 413); }
        chunks.push(value);
      }
      const raw = Buffer.concat(chunks.map(x => Buffer.from(x)), size);
      return fields(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)), required);
    } catch (error) {
      if (error instanceof OperatorError) throw error;
      reject('operator_invalid', 400);
    } finally { reader.releaseLock(); }
  }
  async function rate(scope, max, seconds) {
    const window = Math.floor(now() / seconds) * seconds;
    const key = hashed('rate', scope);
    const result = await pool.query(
      'INSERT INTO portal_rate_buckets(key,"window",count) VALUES($1,$2,1) '
      + 'ON CONFLICT(key,"window") DO UPDATE SET count=portal_rate_buckets.count+1 RETURNING count',
      [key, window]);
    if (result.rows[0].count > max) reject('operator_rate_limited', 429);
  }
  async function credentialProof(value) {
    if (!identifier(value.challengeId) || typeof value.nonce !== 'string'
      || !/^[A-Za-z0-9_-]{43}$/.test(value.nonce)) reject();
    const challenge = (await pool.query(
      'SELECT * FROM cs_stage_operator_challenges WHERE id=$1', [value.challengeId])).rows[0];
    if (!challenge || challenge.consumed_at !== null || Number(challenge.expires_at) <= now()
      || !hexEqual(challenge.nonce_hash, hashed('nonce', value.nonce))) reject();
    let google;
    try {
      google = await verifyGoogle(value.credential, { clientId: config.googleClientId, nonce: value.nonce });
    } catch { reject(); }
    let verifiedEmail;
    try { verifiedEmail = normalizeEmail(google.email); } catch { reject(); }
    if (google.subject !== settings.subject || verifiedEmail !== settings.email) reject();
    // Never promote an already-linked Google citizen to the operator role,
    // even if private configuration is accidentally pointed at that subject.
    const existingCitizen = await pool.query(
      'SELECT 1 FROM portal_google_identities WHERE google_sub=$1 LIMIT 1', [google.subject]);
    if (existingCitizen.rowCount) reject('operator_forbidden', 403);
    return google;
  }
  async function consumeProof(db, value) {
    const row = (await db.query(
      'SELECT * FROM cs_stage_operator_challenges WHERE id=$1 FOR UPDATE', [value.challengeId])).rows[0];
    if (!row || row.consumed_at !== null || Number(row.expires_at) <= now()
      || !hexEqual(row.nonce_hash, hashed('nonce', value.nonce))) reject();
    const fingerprint = googleCredentialFingerprint(value.credential);
    const seen = await db.query(
      'INSERT INTO cs_stage_operator_credential_uses(fingerprint,used_at) VALUES($1,$2) '
      + 'ON CONFLICT DO NOTHING RETURNING fingerprint', [fingerprint, now()]);
    if (!seen.rowCount) reject();
    await db.query(
      'UPDATE cs_stage_operator_challenges SET consumed_at=$1 WHERE id=$2', [now(), value.challengeId]);
  }
  async function audit(db, actorId, action, record) {
    await db.query(
      'INSERT INTO portal_audit_events(id,actor_id,action,record,metadata_json,created_at) '
      + "VALUES($1,$2,$3,$4,'{}',$5)", [newId(), actorId, action, record, now()]);
  }
  async function loginRecord(db, actor, succeeded) {
    await db.query(
      'INSERT INTO portal_login_events(id,user_id,email,name,success,reason,ip_label,user_agent,created_at) '
      + 'VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [newId(), actor?.id || null, settings.email, actor?.name || '',
        succeeded, succeeded ? 'staging_google_password_totp' : 'staging_operator_denied', 'unavailable', '', now()]);
  }
  app.get('/operator/v1/health', c => safe(c, {
    status: settings.enabled ? 'configuration_present' : 'disabled',
    googleClientId: settings.enabled ? config.googleClientId : '',
    acceptsRealComplaints: false,
  }, settings.enabled ? 200 : 503));
  // Verification-only, nonprivileged Google proof. Safe while operator enrollment
  // is disabled: a verified identity is NOT an administrator account or session.
  app.post('/operator/v1/identity-challenge', async c => {
    await body(c, []);
    if (env.STAGING_BRANCH_ID !== BRANCH || !config.googleClientId || !settings.email)
      reject('operator_disabled', 503);
    // Public nonce issuance is capped as an emergency resource safety limit, not an
    // authentication-attempt lockout. Edge-side per-client throttling remains necessary.
    await rate('operator-identity-challenge', 900, 900);
    const id = newId(), nonce = newToken(), expiresAt = now() + 300;
    await pool.query('INSERT INTO cs_stage_operator_challenges(id,nonce_hash,created_at,expires_at) '
      + 'VALUES($1,$2,$3,$4)', [id, hashed('nonce', nonce), now(), expiresAt]);
    return safe(c, { challengeId: id, nonce, expiresAt, googleClientId: config.googleClientId });
  });
  app.post('/operator/v1/identity-proof', async c => {
    const value = await body(c, ['challengeId', 'nonce', 'credential']);
    if (env.STAGING_BRANCH_ID !== BRANCH || !config.googleClientId || !settings.email)
      reject('operator_disabled', 503);
    if (!identifier(value.challengeId) || typeof value.nonce !== 'string'
      || !/^[A-Za-z0-9_-]{43}$/.test(value.nonce)) reject();
    const challenge = (await pool.query(
      'SELECT * FROM cs_stage_operator_challenges WHERE id=$1', [value.challengeId])).rows[0];
    if (!challenge || challenge.consumed_at !== null || Number(challenge.expires_at) <= now()
      || !hexEqual(challenge.nonce_hash, hashed('nonce', value.nonce))) reject();
    let google;
    try {
      google = await verifyGoogle(value.credential, {clientId: config.googleClientId, nonce: value.nonce});
    } catch { reject(); }
    let verifiedEmail;
    try { verifiedEmail = normalizeEmail(google.email); } catch { reject(); }
    if (verifiedEmail !== settings.email || !/^[0-9]{8,32}$/.test(google.subject))
      reject('operator_forbidden', 403);
    const citizen = await pool.query(
      'SELECT 1 FROM portal_google_identities WHERE google_sub=$1 LIMIT 1', [google.subject]);
    if (citizen.rowCount) reject('operator_forbidden', 403);
    // Only cryptographically verified Google assertions may spend the shared
    // identity-proof budget; anonymous requests cannot lock out the owner.
    await rate('operator-identity-proof', 12, 900);
    await transaction(pool, async db => { await consumeProof(db, value); });
    return safe(c, { verifiedEmail, verifiedGoogleSub: google.subject, operatorEnrolled: false });
  });
  app.post('/operator/v1/challenge', async c => {
    ready(); await body(c, []);
    // Keep a broad infrastructure safety cap; never let a handful of anonymous
    // challenge requests consume the owner's small credential-attempt budget.
    // Configure upstream per-client throttling before deploying publicly.
    await rate('challenge', 600, 60);
    const id = newId(), nonce = newToken(), expiresAt = now() + 300;
    await pool.query('INSERT INTO cs_stage_operator_challenges(id,nonce_hash,created_at,expires_at) '
      + 'VALUES($1,$2,$3,$4)', [id, hashed('nonce', nonce), now(), expiresAt]);
    return safe(c, { challengeId: id, nonce, expiresAt });
  });
  app.post('/operator/v1/begin', async c => {
    ready();
    const value = await body(c, ['challengeId', 'nonce', 'credential', 'approvalKey', 'password', 'confirmPassword']);
    secureApproval(value.approvalKey);
    password(value.password, value.confirmPassword);
    const google = await credentialProof(value);
    // Require BOTH the private approval secret and signed Google identity
    // before charging the privileged bootstrap budget.
    await rate('begin', 12, 900);
    const secret = generateTotpSecret();
    const encrypted = encryptTotp(secret, config.totpKey);
    const passwordHash = await hashPassword(value.password);
    const id = newId(), expiresAt = now() + 600;
    await transaction(pool, async db => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('cs-stage:owner:bootstrap',0))");
      await consumeProof(db, value);
      const occupied = await db.query(
        "SELECT id FROM portal_users WHERE role='owner' OR email=$1 LIMIT 1 FOR UPDATE",
        [settings.email]);
      if (occupied.rowCount) reject('operator_owner_exists', 409);
      await db.query('INSERT INTO cs_stage_operator_pending '
        + '(id,owner_google_sub,owner_email,password_hash,encrypted_totp,attempts,created_at,expires_at) '
        + 'VALUES($1,$2,$3,$4,$5,0,$6,$7)',
        [id, google.subject, settings.email, passwordHash, encrypted, now(), expiresAt]);
    });
    // The seed is displayed once, only to the Google-verified operator.
    // Do not store it in localStorage or share a browser screenshot.
    return safe(c, { provisionId: id, secret, uri: totpUri(secret, settings.email), expiresAt });
  });
  app.post('/operator/v1/finish', async c => {
    ready();
    const value = await body(c, ['challengeId', 'nonce', 'credential', 'approvalKey', 'provisionId', 'code']);
    secureApproval(value.approvalKey);
    await credentialProof(value);
    if (!identifier(value.provisionId) || typeof value.code !== 'string'
      || !/^[0-9]{6}$/.test(value.code)) reject();
    await rate('finish', 20, 900);
    const result = await transaction(pool, async db => {
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('cs-stage:owner:bootstrap',0))");
      await consumeProof(db, value);
      const pending = (await db.query(
        'SELECT * FROM cs_stage_operator_pending WHERE id=$1 FOR UPDATE', [value.provisionId])).rows[0];
      if (!pending || pending.owner_google_sub !== settings.subject || pending.owner_email !== settings.email
        || Number(pending.expires_at) <= now() || pending.attempts >= 5)
        return { error: 'operator_invalid' };
      const secret = decryptTotp(pending.encrypted_totp, config.totpKey);
      const step = totpStep(value.code, secret);
      if (step === null) {
        await db.query('UPDATE cs_stage_operator_pending SET attempts=attempts+1 WHERE id=$1', [pending.id]);
        return { error: 'operator_invalid' };
      }
      const occupied = await db.query(
        "SELECT id FROM portal_users WHERE role='owner' OR email=$1 LIMIT 1 FOR UPDATE",
        [settings.email]);
      if (occupied.rowCount) return { error: 'operator_owner_exists', status: 409 };
      const actor = { id: newId(), name: 'Staging Owner' };
      await db.query(
        'INSERT INTO portal_users(id,email,name,password_hash,language,role,active,verified_at,created_at,updated_at,version,totp_secret,totp_last_step) '
        + "VALUES($1,$2,$3,$4,'en','owner',true,$5,$5,$5,1,$6,$7)",
        [actor.id, settings.email, actor.name, pending.password_hash, now(), pending.encrypted_totp, step]);
      await db.query('DELETE FROM cs_stage_operator_pending WHERE id=$1', [pending.id]);
      await audit(db, actor.id, 'staging.owner.provisioned', actor.id);
      await loginRecord(db, actor, true);
      return { provisioned: true };
    });
    if (result.error) reject(result.error, result.status || 401);
    return safe(c, result);
  });
  app.post('/operator/v1/login', async c => {
    ready();
    const value = await body(c, ['challengeId', 'nonce', 'credential', 'password', 'code']);
    await credentialProof(value);
    if (typeof value.password !== 'string' || value.password.length > 128
      || typeof value.code !== 'string' || !/^[0-9]{6}$/.test(value.code)) reject();
    // Authenticate the signed, nonce-bound Google assertion FIRST. Unverified
    // clients cannot exhaust the owner's 8-attempt password/TOTP budget.
    await rate('login', 8, 900);
    const candidate = (await pool.query(
      "SELECT * FROM portal_users WHERE email=$1 AND role='owner' AND active=true",
      [settings.email])).rows[0];
    if (!candidate || !await verifyPassword(value.password, candidate.password_hash)) {
      await loginRecord(pool, candidate, false);
      reject();
    }
    const result = await transaction(pool, async db => {
      const actor = (await db.query(
        "SELECT * FROM portal_users WHERE id=$1 AND role='owner' AND active=true FOR UPDATE",
        [candidate.id])).rows[0];
      if (!actor || actor.email !== settings.email || actor.version !== candidate.version
        || actor.password_hash !== candidate.password_hash || !actor.totp_secret)
        return null;
      const secret = decryptTotp(actor.totp_secret, config.totpKey);
      const step = totpStep(value.code, secret, actor.totp_last_step);
      if (step === null) {
        await loginRecord(db, actor, false);
        return null;
      }
      await consumeProof(db, value);
      await db.query('UPDATE portal_users SET totp_last_step=$1 WHERE id=$2', [step, actor.id]);
      const token = newToken(), id = newId(), seconds = now();
      await db.query(
        'INSERT INTO cs_stage_operator_sessions(id,token_hash,owner_id,owner_version,created_at,expires_at,mfa_at) '
        + 'VALUES($1,$2,$3,$4,$5,$6,$5)',
        [id, hashed('session', token), actor.id, actor.version, seconds, seconds + 1800]);
      await audit(db, actor.id, 'staging.owner.mfa_login', actor.id);
      await loginRecord(db, actor, true);
      return { token, expiresAt: seconds + 1800, mfaVerified: true };
    });
    if (!result) reject();
    // A staging operator bearer is recognized ONLY by this operator Function.
    // No citizen API route will accept its HMAC or its independent session row.
    return safe(c, result);
  });

  // Every privileged operation authenticates a dedicated, revocable operator
  // session and checks the current server-side owner role, approved identity,
  // account version, and fresh MFA. Citizen sessions are never consulted.
  async function operatorAuth(c, db = pool) {
    ready();
    const bearer = c.req.header('Authorization') || '';
    if (!/^Bearer [A-Za-z0-9_-]{43}$/.test(bearer)) reject('operator_unauthorized', 401);
    const token = bearer.slice(7);
    const result = await db.query(
      'SELECT s.id AS session_id,s.owner_id,s.owner_version,s.mfa_at,u.email,u.role,u.active,u.version '
      + 'FROM cs_stage_operator_sessions s JOIN portal_users u ON u.id=s.owner_id '
      + 'WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2',
      [hashed('session', token), now()]);
    const row = result.rows[0];
    if (!row || row.role !== 'owner' || row.email !== settings.email
      || !row.active || row.owner_version !== row.version
      || Number(row.mfa_at) + 600 < now()) reject('operator_unauthorized', 401);
    return row;
  }
  const transitions = {
    pending: ['in_review', 'closed'],
    in_review: ['awaiting_info', 'resolved', 'closed'],
    awaiting_info: ['in_review', 'resolved', 'closed'],
    resolved: ['closed', 'in_review'],
    closed: [],
  };

  // Read-only owner workspace. All endpoints reuse the independently signed
  // staging operator session, never a citizen bearer or client-side role flag.
  const PAGE_SIZE = 20;
  function workspacePage(c) {
    const raw = c.req.query('page') || '1';
    if (!/^[1-9][0-9]{0,2}$/.test(raw)) reject('operator_invalid', 400);
    return Number(raw);
  }
  function paged(rows, page) {
    return { items: rows.slice(0, PAGE_SIZE), page, pageSize: PAGE_SIZE,
      hasMore: rows.length > PAGE_SIZE, scope: 'fictional-staging-only' };
  }
  app.get('/operator/v1/workspace/summary', async c => {
    await operatorAuth(c);
    const [users, cases, citizenSessions, ownerSessions, recentLogins] = await Promise.all([
      pool.query("SELECT count(*)::int AS n FROM portal_users WHERE role='citizen'"),
      pool.query('SELECT status,count(*)::int AS n FROM portal_complaints GROUP BY status'),
      pool.query('SELECT count(*)::int AS n FROM portal_sessions s JOIN portal_users u ON u.id=s.user_id WHERE s.authenticated_at IS NOT NULL AND s.expires_at>$1 AND u.active=true', [now()]),
      pool.query('SELECT count(*)::int AS n FROM cs_stage_operator_sessions s JOIN portal_users u ON u.id=s.owner_id WHERE s.revoked_at IS NULL AND s.expires_at>$1 AND s.mfa_at+600 >= $1 AND u.active=true AND s.owner_version=u.version', [now()]),
      pool.query('SELECT count(*)::int AS n FROM portal_login_events WHERE success=true AND created_at>=$1', [now()-86400]),
    ]);
    const statuses = Object.fromEntries(cases.rows.map(x => [x.status, x.n]));
    return safe(c, {
      citizens: users.rows[0].n,
      cases: Object.values(statuses).reduce((sum, value) => sum + value, 0),
      pending: statuses.pending || 0,
      inReview: statuses.in_review || 0,
      citizenSessions: citizenSessions.rows[0].n,
      operatorSessions: ownerSessions.rows[0].n,
      successfulLogins24h: recentLogins.rows[0].n,
      scope: 'fictional-staging-only',
    });
  });
  app.get('/operator/v1/workspace/users', async c => {
    await operatorAuth(c);
    const page = workspacePage(c);
    const rawTerm = c.req.query('q') || '';
    const term = rawTerm.trim();
    if (rawTerm.length > 80 || /[\x00-\x1f\x7f]/.test(rawTerm)) reject('operator_invalid', 400);
    const rows = (await pool.query(
      "SELECT u.id,u.email,u.name,u.role,u.active,u.version,u.created_at,u.updated_at, "
      + "(SELECT max(l.created_at) FROM portal_login_events l WHERE l.user_id=u.id AND l.success=true) AS last_login_at, "
      + "(SELECT max(l.created_at) FROM portal_login_events l WHERE l.user_id=u.id AND l.success=false) AS last_failed_login_at, "
      + "(SELECT max(a.created_at) FROM portal_audit_events a WHERE a.actor_id=u.id AND a.action IN ('auth.logout','staging.owner.logout')) AS last_logout_at, "
      + "(SELECT count(*)::int FROM portal_complaints c WHERE c.user_id=u.id) AS case_count, "
      + "(SELECT c.status FROM portal_complaints c WHERE c.user_id=u.id ORDER BY c.updated_at DESC,c.id DESC LIMIT 1) AS latest_case_status, "
      + "ARRAY(SELECT c.reference FROM portal_complaints c WHERE c.user_id=u.id ORDER BY c.updated_at DESC,c.id DESC LIMIT 5) AS case_references, "
      + "(SELECT count(*)::int FROM portal_sessions s WHERE s.user_id=u.id AND s.authenticated_at IS NOT NULL AND s.expires_at>$3) AS citizen_active_sessions, "
      + "(SELECT count(*)::int FROM cs_stage_operator_sessions s WHERE s.owner_id=u.id AND s.revoked_at IS NULL AND s.expires_at>$3 AND s.mfa_at+600 >= $3 AND s.owner_version=u.version) AS operator_active_sessions, "
      + "CASE WHEN u.role='owner' THEN 'google_password_totp' WHEN EXISTS(SELECT 1 FROM portal_google_identities g WHERE g.user_id=u.id) THEN 'google' ELSE 'email_password_otp' END AS authentication_method "
      + "FROM portal_users u WHERE ($1='' OR position(lower($1) in lower(u.email))>0 OR position(lower($1) in lower(u.name))>0) "
      + "ORDER BY u.created_at DESC,u.id DESC LIMIT 21 OFFSET $2",
      [term, (page-1)*PAGE_SIZE, now()])).rows;
    return safe(c, { ...paged(rows, page), search: term });
  });
  app.get('/operator/v1/workspace/users/:id/cases', async c => {
    await operatorAuth(c);
    const page = workspacePage(c);
    if (!identifier(c.req.param('id'))) reject('operator_invalid', 400);
    const exists = await pool.query('SELECT 1 FROM portal_users WHERE id=$1', [c.req.param('id')]);
    if (!exists.rowCount) reject('operator_not_found', 404);
    const rows = (await pool.query(
      'SELECT reference,status,category,created_at,updated_at FROM portal_complaints '
      + 'WHERE user_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 21 OFFSET $2',
      [c.req.param('id'), (page-1)*PAGE_SIZE])).rows;
    return safe(c, paged(rows, page));
  });
  // Owner-only citizen account status changes. Retain session history but expire
  // outstanding citizen sessions/challenges on disable so re-enable cannot revive them.
  app.patch('/operator/v1/workspace/users/:id', async c => {
    await operatorAuth(c);
    const id = c.req.param('id');
    const value = await body(c, ['active', 'version']);
    if (!identifier(id) || typeof value.active !== 'boolean'
      || !Number.isSafeInteger(value.version) || value.version < 1)
      reject('operator_invalid', 400);
    await rate('owner-user-status', 12, 3600);
    const result = await transaction(pool, async db => {
      const actor = await operatorAuth(c, db);
      const user = (await db.query(
        'SELECT id,role,active,version FROM portal_users WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!user) reject('operator_not_found', 404);
      if (user.role !== 'citizen' || user.id === actor.owner_id)
        reject('operator_forbidden', 403);
      if (Number(user.version) !== value.version)
        reject('operator_version_conflict', 409);
      if (user.active === value.active)
        return { id: user.id, active: user.active, version: Number(user.version), changed: false };
      const stamp = now(), nextVersion = Number(user.version) + 1;
      await db.query('UPDATE portal_users SET active=$1,version=$2,updated_at=$3 WHERE id=$4',
        [value.active, nextVersion, stamp, user.id]);
      if (!value.active) {
        await db.query(
          'UPDATE portal_challenges SET expires_at=LEAST(expires_at,$2) WHERE user_id=$1 '
          + 'OR browser_id IN (SELECT id FROM portal_sessions WHERE user_id=$1)', [user.id, stamp]);
        await db.query('UPDATE portal_sessions SET expires_at=LEAST(expires_at,$2) '
          + 'WHERE user_id=$1', [user.id, stamp]);
      }
      await audit(db, actor.owner_id,
        value.active ? 'staging.owner.citizen_enabled' : 'staging.owner.citizen_disabled', user.id);
      return { id: user.id, active: value.active, version: nextVersion, changed: true };
    });
    return safe(c, { user: result });
  });

  // Searchable, server-paginated case directory; no client-side privilege checks.
  // Reuses the same fresh owner MFA gate as all other workspace views.
  app.get('/operator/v1/workspace/cases', async c => {
    await operatorAuth(c);
    const page = workspacePage(c);
    const rawTerm = c.req.query('q') || '';
    const term = rawTerm.trim();
    const status = c.req.query('status') || 'all';
    if (rawTerm.length > 80 || /[\x00-\x1f\x7f]/.test(rawTerm)
      || !['all', 'pending', 'in_review', 'awaiting_info', 'resolved', 'closed'].includes(status))
      reject('operator_invalid', 400);
    const rows = (await pool.query(
      `SELECT c.id,c.reference,c.subject,c.category,c.status,c.version,c.created_at,c.updated_at
       FROM portal_complaints c
       WHERE ($1='' OR position(lower($1) in lower(c.reference))>0
          OR position(lower($1) in lower(c.subject))>0)
         AND ($2='all' OR c.status=$2)
       ORDER BY c.updated_at DESC,c.id DESC LIMIT 21 OFFSET $3`,
      [term, status, (page - 1) * PAGE_SIZE])).rows;
    return safe(c, { ...paged(rows, page), search: term, status });
  });

  app.get('/operator/v1/workspace/events', async c => {
    await operatorAuth(c);
    const page = workspacePage(c);
    const type = c.req.query('type') || 'all';
    if (!['all','login','logout','audit'].includes(type)) reject('operator_invalid', 400);
    const rows = (await pool.query(
      "SELECT event_id,user_id,email,source,result,detail,created_at FROM ( "
      + "SELECT l.id AS event_id,l.user_id,l.email,'login'::text AS source, "
      + "CASE WHEN l.success THEN 'success' ELSE 'failed' END AS result, "
      + "l.reason AS detail,l.created_at FROM portal_login_events l "
      + "UNION ALL SELECT a.id,a.actor_id,u.email, "
      + "CASE WHEN a.action IN ('auth.logout','staging.owner.logout') THEN 'logout' ELSE 'audit' END, "
      + "'recorded'::text,a.action,a.created_at FROM portal_audit_events a "
      + "JOIN portal_users u ON u.id=a.actor_id "
      + ") events WHERE ($1='all' OR source=$1) ORDER BY created_at DESC,event_id DESC LIMIT 21 OFFSET $2",
      [type, (page-1)*PAGE_SIZE])).rows;
    // A failed login email is a *claimed* address, not a verified identity.
    return safe(c, { ...paged(rows, page), type, emailTrust: 'failed-login-email-unverified' });
  });
  app.get('/operator/v1/workspace/sessions', async c => {
    await operatorAuth(c);
    const page = workspacePage(c);
    const stamp = now();
    const rows = (await pool.query(
      "SELECT user_id,email,service,created_at,expires_at,session_state FROM ( "
      + "SELECT s.user_id,u.email,'citizen'::text AS service,s.created_at,s.expires_at, "
      + "CASE WHEN NOT u.active THEN 'revoked' WHEN s.expires_at <= $1 THEN 'expired' ELSE 'active' END AS session_state "
      + "FROM portal_sessions s JOIN portal_users u ON u.id=s.user_id WHERE s.authenticated_at IS NOT NULL "
      + "UNION ALL SELECT s.owner_id,u.email,'operator'::text,s.created_at,s.expires_at, "
      + "CASE WHEN s.revoked_at IS NOT NULL OR NOT u.active OR s.owner_version<>u.version THEN 'revoked' "
      + "WHEN s.expires_at <= $1 THEN 'expired' WHEN s.mfa_at + 600 < $1 THEN 'mfa_refresh_required' ELSE 'active' END "
      + "FROM cs_stage_operator_sessions s JOIN portal_users u ON u.id=s.owner_id "
      + ") sessions ORDER BY created_at DESC,user_id DESC LIMIT 21 OFFSET $2",
      [stamp, (page-1)*PAGE_SIZE])).rows;
    return safe(c, { ...paged(rows, page),
      note: 'Deleted citizen sessions cannot be reconstructed; browser close does not prove logout.' });
  });
  app.get('/operator/v1/workspace/audit', async c => {
    await operatorAuth(c);
    const page = workspacePage(c);
    const rows = (await pool.query(
      'SELECT a.id,a.actor_id,u.email,a.action,a.record,a.created_at '
      + 'FROM portal_audit_events a JOIN portal_users u ON u.id=a.actor_id '
      + 'ORDER BY a.created_at DESC,a.id DESC LIMIT 21 OFFSET $1',
      [(page-1)*PAGE_SIZE])).rows;
    return safe(c, paged(rows, page));
  });

  app.get('/operator/v1/summary', async c => {
    await operatorAuth(c);
    const rows = (await pool.query(
      'SELECT status,count(*)::int AS n FROM portal_complaints GROUP BY status')).rows;
    const counts = Object.fromEntries(rows.map(x => [x.status, x.n]));
    return safe(c, { counts, scope: 'fictional-staging-only' });
  });
  app.get('/operator/v1/cases', async c => {
    await operatorAuth(c);
    const cases = (await pool.query(
      'SELECT id,reference,subject,category,status,version,created_at,updated_at '
      + 'FROM portal_complaints ORDER BY updated_at DESC LIMIT 50')).rows;
    return safe(c, { cases });
  });
  app.get('/operator/v1/cases/:id', async c => {
    await operatorAuth(c);
    if (!identifier(c.req.param('id'))) reject('operator_invalid', 400);
    const row = (await pool.query(
      'SELECT id,reference,subject,category,details,status,version,created_at,updated_at '
      + 'FROM portal_complaints WHERE id=$1', [c.req.param('id')])).rows[0];
    if (!row) reject('operator_not_found', 404);
    const events = (await pool.query(
      'SELECT sequence,author_role,author_name,message,old_status,new_status,created_at '
      + 'FROM portal_case_events WHERE complaint_id=$1 ORDER BY sequence', [row.id])).rows;
    return safe(c, { case: row, events });
  });
  app.patch('/operator/v1/cases/:id', async c => {
    ready();
    const value = await body(c, ['status', 'message', 'version']);
    if (!identifier(c.req.param('id'))
      || !Object.prototype.hasOwnProperty.call(transitions, value.status)
      || !Number.isSafeInteger(value.version) || value.version < 1
      || typeof value.message !== 'string' || value.message.length < 3
      || value.message.length > 3000) reject('operator_invalid', 400);
    // Reject anonymous/citizen calls before spending the owner write-rate budget.
    await operatorAuth(c);
    await rate('case-update', 30, 3600);
    const updated = await transaction(pool, async db => {
      const actor = await operatorAuth(c, db);
      const row = (await db.query(
        'SELECT * FROM portal_complaints WHERE id=$1 FOR UPDATE',
        [c.req.param('id')])).rows[0];
      if (!row) reject('operator_not_found', 404);
      if (row.version !== value.version) reject('operator_version_conflict', 409);
      if (value.status !== row.status
        && !transitions[row.status]?.includes(value.status)) reject('operator_invalid', 400);
      const former = row.status, stamp = now(), nextVersion = row.version + 1;
      await db.query(
        'UPDATE portal_complaints SET status=$1,version=$2,updated_at=$3 WHERE id=$4',
        [value.status, nextVersion, stamp, row.id]);
      await db.query(
        'INSERT INTO portal_case_events(id,complaint_id,actor_id,sequence,author_role,author_name,message,old_status,new_status,created_at) '
        + "VALUES($1,$2,$3,$4,'owner',$5,$6,$7,$8,$9)",
        [newId(), row.id, actor.owner_id, nextVersion, 'Staging Owner',
          value.message, former, value.status, stamp]);
      await audit(db, actor.owner_id, 'staging.owner.case_updated', row.id);
      return { reference: row.reference, status: value.status, version: nextVersion };
    });
    return safe(c, { case: updated });
  });
  app.post('/operator/v1/logout', async c => {
    await body(c, []);
    await transaction(pool, async db => {
      const actor = await operatorAuth(c, db);
      await db.query(
        'UPDATE cs_stage_operator_sessions SET revoked_at=$1 WHERE id=$2 AND revoked_at IS NULL',
        [now(), actor.session_id]);
      await audit(db, actor.owner_id, 'staging.owner.logout', actor.session_id);
    });
    return safe(c, { signedOut: true });
  });

  return { app, pool, settings };
}
