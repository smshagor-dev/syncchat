const MAX_LEN = 180;
const fs = require('fs');
const path = require('path');

const now = () => new Date().toISOString();
const isVercel = Boolean(process.env.VERCEL);
const logDir = path.resolve(__dirname, '..', '..', 'logs');
const logFile = path.join(logDir, 'server.log');
const QUIET_CONSOLE_PREFIXES = ['CHAT_', 'SOCKET_', 'HTTP_'];

const trim = (value) => {
  const str = String(value ?? '');
  if (str.length <= MAX_LEN) return str;
  return `${str.slice(0, MAX_LEN)}...(${str.length} chars)`;
};

const isPlainObject = (value) =>
  value &&
  typeof value === 'object' &&
  Object.prototype.toString.call(value) === '[object Object]';

const sanitize = (value, depth = 0) => {
  if (depth > 2) return '[depth-limit]';

  if (typeof value === 'string') return trim(value);
  if (typeof value === 'number' || typeof value === 'boolean' || !value) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => sanitize(item, depth + 1));
  }
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}]`;
  if (value instanceof Date) return value.toISOString();

  if (isPlainObject(value)) {
    const out = {};
    Object.keys(value)
      .slice(0, 20)
      .forEach((key) => {
        if (key.toLowerCase().includes('password')) {
          out[key] = '[redacted]';
        } else {
          out[key] = sanitize(value[key], depth + 1);
        }
      });
    return out;
  }

  return trim(value);
};

const writeFileLog = (line) => {
  // Vercel's deployed function bundle is read-only. Runtime logs should go to
  // stdout/stderr there and are collected automatically by Vercel.
  if (isVercel) return;

  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `${line}\n`, 'utf8');
  } catch (error) {
    // Logging must never make an application request fail.
    // eslint-disable-next-line no-console
    console.error(`${now()} [WARN] FILE_LOG_WRITE_FAILED`, error.message);
  }
};

const print = (level, tag, payload) => {
  const isQuietTag = QUIET_CONSOLE_PREFIXES.some((prefix) =>
    String(tag || '').startsWith(prefix)
  );

  let line = `${now()} [${level}] ${tag}`;
  if (payload === undefined) {
    if (!isQuietTag) {
      // eslint-disable-next-line no-console
      console.log(line);
    }
    writeFileLog(line);
    return;
  }

  const safePayload = sanitize(payload);
  line = `${line} ${JSON.stringify(safePayload)}`;
  if (!isQuietTag) {
    // eslint-disable-next-line no-console
    console.log(`${now()} [${level}] ${tag}`, safePayload);
  }
  writeFileLog(line);
};

exports.info = (tag, payload) => print('INFO', tag, payload);
exports.warn = (tag, payload) => print('WARN', tag, payload);
exports.error = (tag, payload) => print('ERROR', tag, payload);
