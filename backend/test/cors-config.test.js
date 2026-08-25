const test = require('node:test');
const assert = require('node:assert/strict');

const configPath = require.resolve('../server/config');

const loadConfig = (env) => {
  const keys = [
    'NODE_ENV',
    'CORS_ORIGINS',
    'APP_ORIGIN',
    'CLIENT_ORIGIN',
    'ADMIN_ORIGIN',
    'ADMIN_PUBLIC_ORIGIN',
    'PUBLIC_ORIGIN',
    'SERVER_ORIGIN',
    'API_ORIGIN',
    'API_BASE_URL',
    'SOCKET_URL',
  ];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    keys.forEach((key) => delete process.env[key]);
    Object.assign(process.env, env);
    delete require.cache[configPath];
    return require(configPath);
  } finally {
    keys.forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
    delete require.cache[configPath];
  }
};

test('production CORS always permits first-party SyncChat web origins', () => {
  const config = loadConfig({
    NODE_ENV: 'production',
    API_BASE_URL: 'https://api.syncchat.live/api',
    SOCKET_URL: 'https://api.syncchat.live',
  });

  assert.ok(config.cors.origin.includes('https://syncchat.live'));
  assert.ok(config.cors.origin.includes('https://www.syncchat.live'));
  assert.ok(config.cors.origin.includes('https://admin.syncchat.live'));
  assert.ok(config.cors.origin.includes('https://api.syncchat.live'));
});

test('CORS_ORIGINS accepts multiple explicit comma-separated browser origins', () => {
  const config = loadConfig({
    NODE_ENV: 'production',
    CORS_ORIGINS: 'https://preview.syncchat.live, https://partner.example.com',
  });

  assert.ok(config.cors.origin.includes('https://preview.syncchat.live'));
  assert.ok(config.cors.origin.includes('https://partner.example.com'));
});

test('development does not silently add production first-party origins', () => {
  const config = loadConfig({
    NODE_ENV: 'development',
    APP_ORIGIN: 'http://localhost:3000,http://127.0.0.1:3000',
  });

  assert.ok(config.cors.origin.includes('http://localhost:3000'));
  assert.ok(config.cors.origin.includes('http://127.0.0.1:3000'));
  assert.equal(config.cors.origin.includes('https://syncchat.live'), false);
});
