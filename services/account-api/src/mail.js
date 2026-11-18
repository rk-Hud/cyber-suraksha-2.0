import nodemailer from 'nodemailer';
import { transaction } from './db.js';
import { digest } from './crypto.js';

import COPY from '../data/mail.json' with { type: 'json' };
export class DeliveryError extends Error {
  constructor(code = 'delivery_failed') { super(code); this.name = 'DeliveryError'; }
}
const now = () => Math.floor(Date.now() / 1000);

export function createMailer(config, testTransport) {
  if (testTransport && config.nodeEnv !== 'test') throw new Error('Test mail transport is forbidden outside tests');
  let smtp;
  const ready = Boolean(testTransport || config.mailReady);
  async function send(recipient, subject, body, identity) {
    if (!ready) throw new DeliveryError('mail_unconfigured');
    if (/[\r\n\x00]/.test(recipient + subject)) throw new DeliveryError('invalid_recipient');
    if (testTransport) return testTransport({ recipient, subject, body, identity });
    try {
      if (config.mail.provider === 'resend') {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { Authorization: 'Bearer ' + config.mail.resendKey, 'Content-Type': 'application/json',
            ...(identity ? { 'Idempotency-Key': identity } : {}) },
          body: JSON.stringify({ from: config.mail.from, to: [recipient], subject, text: body }),
        });
        const accepted = response.status >= 200 && response.status < 300;
        await response.body?.cancel().catch(() => {});
        if (!accepted) throw new DeliveryError('provider_rejected');
      } else {
        smtp ||= nodemailer.createTransport({ host: config.mail.smtpHost, port: config.mail.smtpPort,
          secure: config.mail.smtpSecurity === 'ssl', requireTLS: true,
          auth: { user: config.mail.smtpUser, pass: config.mail.smtpPassword },
          tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
          connectionTimeout: 15000, socketTimeout: 15000, greetingTimeout: 10000, logger: false, debug: false });
        await smtp.sendMail({ from: config.mail.from, to: recipient, subject, text: body,
          ...(identity ? { messageId: '<' + identity + '@cybersuraksha.local>' } : {}) });
      }
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      // Provider exceptions may include addresses or credentials; retain only a stable category.
      throw new DeliveryError();
    }
  }
  return { ready, send, async otp(email, code, language = 'en') {
    const copy = COPY[language] || COPY.en;
    await send(email, copy.otp_subject, copy.otp_body.replace('{code}', code));
  } };
}

export async function dispatchNotifications({ pool, mailer, config }, maximum = 1) {
  let delivered = 0;
  if (!mailer.ready) throw new DeliveryError('mail_unconfigured');
  for (let index = 0; index < Math.min(25, maximum); index++) {
    const job = await transaction(pool, async db => {
      // A process can stop after leasing its final attempt. Expire that lease
      // into a visible dead job rather than leaving it permanently "sending".
      await db.query(`UPDATE portal_notifications SET status='dead',leased_at=NULL,last_error='delivery_lease_expired'
        WHERE status='sending' AND attempts>=6 AND leased_at<$1-300`, [now()]);
      const { rows } = await db.query(`SELECT n.*, u.email FROM portal_notifications n
        JOIN portal_users u ON u.id=n.user_id WHERE
        ((n.status='pending' AND n.due_at <= $1) OR (n.status='sending' AND n.leased_at < $1-300))
        AND n.attempts < 6 ORDER BY n.due_at FOR UPDATE OF n SKIP LOCKED LIMIT 1`, [now()]);
      if (!rows[0]) return null;
      const row = rows[0];
      // OTP and status messages share the conservative provider allowance.
      // Reserve it transactionally so parallel dispatches cannot overspend.
      for (const [scope, period, limit] of [['mail:hour', 3600, 80], ['mail:day', 86400, 90]]) {
        const key = digest(config.sessionKey, 'api-v1:rate', scope + '\0public');
        const window = Math.floor(now() / period) * period;
        const used = await db.query(`INSERT INTO portal_rate_buckets(key,"window",count) VALUES($1,$2,1)
          ON CONFLICT(key,"window") DO UPDATE SET count=portal_rate_buckets.count+1 RETURNING count`, [key, window]);
        if (used.rows[0].count > limit) return null;
      }
      row.attempts += 1;
      await db.query("UPDATE portal_notifications SET status='sending', leased_at=$1, attempts=$2 WHERE id=$3", [now(), row.attempts, row.id]);
      return row;
    });
    if (!job) break;
    const copy = COPY[job.language] || COPY.en;
    const target = new URL(config.publicWebUrl);
    target.pathname = target.pathname.replace(/\/?$/, '/') + job.language + '/account.html';
    // Open the authenticated case list. Email and URLs carry no case details.
    target.hash = 'cases';
    const values = { reference: job.reference, status: copy.status[job.case_status], url: target.href };
    const interpolate = value => value.replace(/\{(reference|status|url)\}/g, (_, key) => values[key]);
    let failure;
    try { await mailer.send(job.email, interpolate(copy.update_subject), interpolate(copy.update_body), 'case-update-' + job.id); }
    catch (error) { failure = error instanceof DeliveryError ? error.message : 'delivery_failed'; }
    await pool.query(`UPDATE portal_notifications SET status=$1, sent_at=$2, last_error=$3,
      due_at=$4, leased_at=NULL WHERE id=$5 AND status='sending' AND attempts=$6`,
    [failure ? (job.attempts >= 6 ? 'dead' : 'pending') : 'sent', failure ? null : now(), failure || null,
      failure ? now() + Math.min(3600, 30 * 2 ** job.attempts) : job.due_at, job.id, job.attempts]);
    if (!failure) delivered++;
  }
  return delivered;
}
