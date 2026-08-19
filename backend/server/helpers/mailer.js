const crypto = require('crypto');
const net = require('net');
const nodemailer = require('nodemailer');
const { loadAppConfig } = require('./appConfig');
const logger = require('./logger');

const VERIFY_TTL_MS = 5 * 60 * 1000;
let cache = {
  key: '',
  transporter: null,
  verifiedAt: 0,
};

const cleanHeader = (value = '') => String(value || '').replace(/[\r\n]+/g, ' ').trim();
const isEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const parseBoolean = (value, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const resolveSmtp = async () => {
  const appConfig = await loadAppConfig();
  const db = appConfig?.smtp || {};
  const env = process.env;

  const host = String(db.host || env.SMTP_HOST || '').trim();
  const port = Number(db.port || env.SMTP_PORT || 587);
  const user = String(db.user || env.SMTP_USER || '').trim();
  let pass = String(db.pass || env.SMTP_PASS || '');
  if (pass === '******') pass = String(env.SMTP_PASS || '');

  const gmail = host.toLowerCase().includes('gmail') || user.toLowerCase().endsWith('@gmail.com');
  if (gmail) pass = pass.replace(/\s+/g, '');

  const secure = port === 465
    ? true
    : [25, 587, 2525].includes(port)
      ? false
      : parseBoolean(db.secure, parseBoolean(env.SMTP_SECURE, false));

  const fromEmail = String(db.fromEmail || env.SMTP_FROM_EMAIL || user).trim();
  const fromName = cleanHeader(db.fromName || env.SMTP_FROM_NAME || appConfig?.appName || 'SyncChat');

  return {
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
    appName: appConfig?.appName || 'SyncChat',
  };
};

const assertSmtp = (smtp) => {
  if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass) {
    const error = new Error(
      'SMTP is incomplete. Configure host, port, username and password in Admin > App Config.'
    );
    error.code = 'SMTP_NOT_CONFIGURED';
    throw error;
  }
  if (!Number.isInteger(smtp.port) || smtp.port < 1 || smtp.port > 65535) {
    const error = new Error('SMTP port is invalid');
    error.code = 'SMTP_INVALID_PORT';
    throw error;
  }
  if (!isEmail(smtp.fromEmail)) {
    const error = new Error('SMTP From Email is invalid');
    error.code = 'SMTP_INVALID_FROM';
    throw error;
  }
};

const transportKey = (smtp) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        pass: smtp.pass,
      })
    )
    .digest('hex');

const buildTransport = (smtp) => {
  const rejectUnauthorized = parseBoolean(
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED,
    process.env.NODE_ENV === 'production'
  );
  const tls = {
    minVersion: 'TLSv1.2',
    rejectUnauthorized,
  };
  if (!net.isIP(smtp.host)) tls.servername = smtp.host;

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    requireTLS: !smtp.secure && smtp.port === 587,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    pool: true,
    maxConnections: Math.max(1, Number(process.env.SMTP_MAX_CONNECTIONS || 3)),
    maxMessages: Math.max(10, Number(process.env.SMTP_MAX_MESSAGES || 100)),
    connectionTimeout: Math.max(5000, Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 15000)),
    greetingTimeout: Math.max(5000, Number(process.env.SMTP_GREETING_TIMEOUT_MS || 15000)),
    socketTimeout: Math.max(10000, Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000)),
    tls,
  });
};

const getTransport = async () => {
  const smtp = await resolveSmtp();
  assertSmtp(smtp);
  const key = transportKey(smtp);
  if (!cache.transporter || cache.key !== key) {
    if (cache.transporter?.close) cache.transporter.close();
    cache = {
      key,
      transporter: buildTransport(smtp),
      verifiedAt: 0,
    };
  }
  return { smtp, transporter: cache.transporter };
};

const friendlySmtpError = (error0) => {
  const code = String(error0?.code || '').toUpperCase();
  const responseCode = Number(error0?.responseCode || 0);
  let message = error0?.message || 'Email delivery failed';

  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) {
    message = 'SMTP authentication failed. Check the username/password or provider app password.';
  } else if (['ETIMEDOUT', 'ECONNECTION'].includes(code)) {
    message = 'SMTP connection timed out. Check host, port, firewall and provider connectivity.';
  } else if (code === 'ESOCKET' || code === 'ECONNREFUSED') {
    message = 'SMTP socket connection failed. Check host, port, TLS mode and outbound SMTP access.';
  } else if (code === 'EENVELOPE' || responseCode === 550 || responseCode === 553) {
    message = 'SMTP rejected the sender or recipient address. Check From Email and domain authorization.';
  } else if (code === 'ETLS' || /certificate|tls|ssl/i.test(message)) {
    message = 'SMTP TLS negotiation failed. Check port, TLS mode and certificate configuration.';
  }

  const error = new Error(message);
  error.code = code || 'SMTP_DELIVERY_FAILED';
  error.responseCode = responseCode || undefined;
  return error;
};

const verifyMailTransport = async ({ force = false } = {}) => {
  const { smtp, transporter } = await getTransport();
  if (!force && cache.verifiedAt && Date.now() - cache.verifiedAt < VERIFY_TTL_MS) {
    return { configured: true, verified: true, smtp };
  }

  try {
    await transporter.verify();
    cache.verifiedAt = Date.now();
    logger.info('SMTP_VERIFY_OK', {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      user: smtp.user,
    });
    return { configured: true, verified: true, smtp };
  } catch (error0) {
    cache.verifiedAt = 0;
    logger.error('SMTP_VERIFY_FAILED', {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      code: error0.code || null,
      responseCode: error0.responseCode || null,
      message: error0.message,
    });
    throw friendlySmtpError(error0);
  }
};

const htmlToText = (html = '') =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

const renderTemplate = ({ html, fullname, otp }) =>
  String(html || '')
    .split('#fullname#')
    .join(String(fullname || ''))
    .split('#otp#')
    .join(String(otp ?? ''));

const sendMail = async ({ to, fullname, subject, html, otp, text, replyTo }) => {
  const recipient = String(to || '').trim();
  if (!isEmail(recipient)) {
    const error = new Error('Recipient email address is invalid');
    error.code = 'SMTP_INVALID_RECIPIENT';
    throw error;
  }

  const { smtp, transporter } = await getTransport();
  await verifyMailTransport();

  const body = renderTemplate({ html, fullname, otp });
  const safeSubject = cleanHeader(subject || smtp.appName || 'SyncChat');
  const safeReplyTo = replyTo && isEmail(replyTo) ? String(replyTo).trim() : undefined;

  try {
    const result = await transporter.sendMail({
      from: { name: smtp.fromName, address: smtp.fromEmail },
      to: recipient,
      subject: safeSubject,
      html: body,
      text: String(text || htmlToText(body)),
      ...(safeReplyTo ? { replyTo: safeReplyTo } : {}),
      headers: {
        'X-Auto-Response-Suppress': 'All',
        'X-Entity-Ref-ID': crypto.randomUUID(),
      },
    });

    logger.info('MAIL_SENT', {
      messageId: result.messageId || null,
      accepted: Array.isArray(result.accepted) ? result.accepted.length : 0,
      rejected: Array.isArray(result.rejected) ? result.rejected.length : 0,
      response: result.response || null,
      toDomain: recipient.split('@')[1] || '',
    });

    if (Array.isArray(result.rejected) && result.rejected.length > 0 && !(result.accepted || []).length) {
      const error = new Error('SMTP server rejected the recipient');
      error.code = 'SMTP_RECIPIENT_REJECTED';
      throw error;
    }

    return result;
  } catch (error0) {
    logger.error('MAIL_SEND_FAILED', {
      code: error0.code || null,
      responseCode: error0.responseCode || null,
      command: error0.command || null,
      message: error0.message,
      toDomain: recipient.split('@')[1] || '',
    });
    if (error0.code === 'SMTP_RECIPIENT_REJECTED') throw error0;
    throw friendlySmtpError(error0);
  }
};

const getMailStatus = async ({ verify = false } = {}) => {
  try {
    const smtp = await resolveSmtp();
    const configured = Boolean(smtp.host && smtp.port && smtp.user && smtp.pass && smtp.fromEmail);
    let verified = Boolean(cache.verifiedAt && Date.now() - cache.verifiedAt < VERIFY_TTL_MS);
    let error = '';
    if (verify && configured) {
      try {
        await verifyMailTransport({ force: true });
        verified = true;
      } catch (error0) {
        verified = false;
        error = error0.message;
      }
    }
    return {
      configured,
      verified,
      error,
      host: smtp.host || '',
      port: smtp.port || null,
      secure: !!smtp.secure,
      user: smtp.user ? `${smtp.user.slice(0, 2)}***@${smtp.user.split('@')[1] || ''}` : '',
      fromEmail: smtp.fromEmail || '',
      fromName: smtp.fromName || '',
      tlsRejectUnauthorized: parseBoolean(
        process.env.SMTP_TLS_REJECT_UNAUTHORIZED,
        process.env.NODE_ENV === 'production'
      ),
    };
  } catch (error0) {
    return {
      configured: false,
      verified: false,
      error: error0.message,
    };
  }
};

const clearMailTransportCache = () => {
  if (cache.transporter?.close) cache.transporter.close();
  cache = { key: '', transporter: null, verifiedAt: 0 };
};

module.exports = sendMail;
module.exports.clearMailTransportCache = clearMailTransportCache;
module.exports.getMailStatus = getMailStatus;
module.exports.verifyMailTransport = verifyMailTransport;
