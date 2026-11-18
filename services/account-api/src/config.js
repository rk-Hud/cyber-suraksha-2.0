import { domainToASCII } from 'node:url';

export function configuration(env = process.env) {
  const origins = (env.ALLOWED_ORIGINS || 'https://rk-hud.github.io').split(',').map(value => {
    const url = new URL(value.trim());
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && env.NODE_ENV !== 'test')) throw new Error('Invalid allowed origin configuration');
    return url.origin;
  });
  const sessionKey = env.API_SESSION_KEY || '';
  const otpKey = env.API_OTP_KEY || '';
  const from = env.MAIL_FROM || '';
  const provider = env.MAIL_PROVIDER || 'resend';
  const smtpPort = Number(env.SMTP_PORT || 587);
  const smtpSecurity = env.SMTP_SECURITY || 'starttls';
  if (![from, env.SMTP_HOST || '', env.SMTP_USERNAME || ''].every(value => !/[\r\n\x00]/.test(value))) throw new Error('Invalid mail configuration');
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535 || !['starttls', 'ssl'].includes(smtpSecurity)) throw new Error('Invalid SMTP configuration');
  const publicUrl = new URL(env.PUBLIC_WEB_URL || 'https://rk-hud.github.io/cyber-suraksha-2.0/');
  if (publicUrl.protocol !== 'https:' && env.NODE_ENV !== 'test' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) throw new Error('Invalid public website URL');
  const mailConfigured = Boolean(from && (provider === 'resend' && env.RESEND_API_KEY || provider === 'smtp' && env.SMTP_HOST && env.SMTP_USERNAME && env.SMTP_PASSWORD));
  return {
    nodeEnv: env.NODE_ENV || 'production', databaseUrl: env.DATABASE_URL || '', origins,
    sessionKey, otpKey, authReady: sessionKey.length >= 32 && otpKey.length >= 32 && sessionKey !== otpKey,
    totpKey: env.TOTP_ENCRYPTION_KEY || '', adminEmail: normalizeEmail(env.ADMIN_EMAIL || ''),
    registrationEnabled: env.REGISTRATION_ENABLED === '1',
    googleClientId: /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID || '') ? env.GOOGLE_CLIENT_ID : '',
    googleSignIn: env.GOOGLE_SIGNIN_ENABLED === '1' && /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_CLIENT_ID || ''),
    googleRegistration: env.GOOGLE_REGISTRATION_ENABLED === '1',
    mailReady: env.EMAIL_READY === '1' && mailConfigured,
    mail: { provider, from, resendKey: env.RESEND_API_KEY || '', smtpHost: env.SMTP_HOST || '', smtpPort,
      smtpUser: env.SMTP_USERNAME || '', smtpPassword: env.SMTP_PASSWORD || '', smtpSecurity },
    publicWebUrl: publicUrl.href, sessionSeconds: 28800, otpSeconds: 300,
    loginRetentionDays: Math.max(1, Math.min(365, Number(env.LOGIN_RETENTION_DAYS || 30) || 30)),
  };
}

export function normalizeEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || /\s/.test(value) || value.split('@').length !== 2) throw new Error('Invalid email');
  const [local, rawDomain] = value.split('@');
  const domain = domainToASCII(rawDomain).toLowerCase();
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || !domain.includes('.') || domain.length > 253 ||
      domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) throw new Error('Invalid email');
  return local.toLowerCase() + '@' + domain;
}
