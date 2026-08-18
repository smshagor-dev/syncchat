const MAX_LEN = 180;
const QUIET_CONSOLE_PREFIXES = ['CHAT_', 'SOCKET_', 'HTTP_'];

const now = () => new Date().toISOString();
const trim = (value) => {
  const str = String(value ?? '');
  return str.length <= MAX_LEN
    ? str
    : `${str.slice(0, MAX_LEN)}...(${str.length} chars)`;
};
const isPlainObject = (value) =>
  value &&
  typeof value === 'object' &&
  Object.prototype.toString.call(value) === '[object Object]';
const sanitize = (value, depth = 0) => {
  if (depth > 2) return '[depth-limit]';
  if (typeof value === 'string') return trim(value);
  if (typeof value === 'number' || typeof value === 'boolean' || !value) return value;
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
        out[key] = key.toLowerCase().includes('password')
          ? '[redacted]'
          : sanitize(value[key], depth + 1);
      });
    return out;
  }
  return trim(value);
};

const print = (level, tag, payload) => {
  const isQuietTag = QUIET_CONSOLE_PREFIXES.some((prefix) =>
    String(tag || '').startsWith(prefix)
  );
  if (isQuietTag) return;
  const safePayload = payload === undefined ? undefined : sanitize(payload);
  const fn =
    level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  if (safePayload === undefined) fn(`${now()} [${level}] ${tag}`);
  else fn(`${now()} [${level}] ${tag}`, safePayload);
};

exports.info = (tag, payload) => print('INFO', tag, payload);
exports.warn = (tag, payload) => print('WARN', tag, payload);
exports.error = (tag, payload) => print('ERROR', tag, payload);
