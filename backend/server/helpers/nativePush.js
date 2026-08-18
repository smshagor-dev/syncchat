const crypto = require('crypto');
const http2 = require('http2');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const NativePushDeviceModel = require('../db/models/nativePushDevice');
const SettingModel = require('../db/models/setting');
const { toPlainMany } = require('../db/utils');
const { getNativePushConfig } = require('./nativePushConfig');
const logger = require('./logger');

let fcmTokenCache = null;
let apnsProviderTokenCache = null;

const uniq = (values) => [...new Set((values || []).filter(Boolean))];
const restorePem = (value) => String(value || '').replace(/\\n/g, '\n');
const fingerprint = (values) =>
  crypto
    .createHash('sha256')
    .update((values || []).map((value) => String(value || '')).join('\u0000'))
    .digest('hex');

const shouldNotifyCalls = (setting) => {
  if (!setting) return true;
  if (setting.mute) return false;
  if (setting.showPushNotification === false) return false;
  return setting.notifyCalls !== false;
};

const buildCallData = (call = {}) => {
  const entries = {
    type: 'incoming_call',
    callId: call.callId,
    roomId: call.roomId,
    roomType: call.roomType || 'private',
    mediaType: call.mediaType === 'video' ? 'video' : 'audio',
    fromUserId: call.fromUserId,
    fromName: call.fromName || '',
    fromUsername: call.fromUsername || '',
    ringingTimeoutSec: String(call.ringingTimeoutSec || 45),
  };
  return Object.fromEntries(
    Object.entries(entries).map(([key, value]) => [key, String(value ?? '')])
  );
};

const getEligibleDevices = async (userIds) => {
  const targets = uniq(userIds);
  if (!targets.length) return [];

  const settingsRaw = await SettingModel.findAll({
    where: { userId: { [Op.in]: targets } },
    attributes: [
      'userId',
      'mute',
      'showPushNotification',
      'notifyCalls',
    ],
  });
  const settings = toPlainMany(settingsRaw);
  const settingMap = new Map(settings.map((item) => [item.userId, item]));
  const eligible = targets.filter((userId) =>
    shouldNotifyCalls(settingMap.get(userId))
  );
  if (!eligible.length) return [];

  return NativePushDeviceModel.findAll({
    where: {
      userId: { [Op.in]: eligible },
      enabled: true,
    },
  });
};

const fcmConfigured = (android = {}) =>
  Boolean(
    android.enabled === true &&
      android.projectId &&
      android.clientEmail &&
      android.privateKey
  );

const getFcmAccessToken = async (android) => {
  if (!fcmConfigured(android)) return null;
  const now = Date.now();
  const configFingerprint = fingerprint([
    android.projectId,
    android.clientEmail,
    android.privateKey,
  ]);
  if (
    fcmTokenCache &&
    fcmTokenCache.fingerprint === configFingerprint &&
    fcmTokenCache.expiresAt - 60_000 > now
  ) {
    return fcmTokenCache.token;
  }

  const issuedAt = Math.floor(now / 1000);
  const assertion = jwt.sign(
    {
      iss: android.clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: issuedAt,
      exp: issuedAt + 3600,
    },
    restorePem(android.privateKey),
    { algorithm: 'RS256' }
  );

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth-grant-type:jwt-bearer',
    assertion,
  });
  // Google requires this exact OAuth grant type URI.
  body.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(
      payload.error_description || payload.error || 'Unable to authenticate FCM'
    );
    error.statusCode = response.status;
    throw error;
  }

  fcmTokenCache = {
    token: payload.access_token,
    fingerprint: configFingerprint,
    expiresAt: now + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
  };
  return fcmTokenCache.token;
};

const sendFcm = async (device, call, android) => {
  const accessToken = await getFcmAccessToken(android);
  if (!accessToken) return { ok: false, skipped: true, reason: 'fcm_not_configured' };

  const data = buildCallData(call);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(android.projectId)}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: device.token,
          data,
          android: {
            priority: 'high',
            ttl: `${Math.max(10, Number(call.ringingTimeoutSec || 45))}s`,
          },
        },
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return { ok: true };

  const message =
    payload?.error?.message || `FCM request failed with ${response.status}`;
  const details = JSON.stringify(payload?.error?.details || []);
  const unregister =
    response.status === 404 ||
    /UNREGISTERED|registration-token-not-registered/i.test(`${message} ${details}`);
  if (unregister) await device.destroy().catch(() => {});
  return { ok: false, unregister, status: response.status, message };
};

const apnsConfigured = (ios = {}) =>
  Boolean(
    ios.enabled === true &&
      ios.teamId &&
      ios.keyId &&
      ios.bundleId &&
      ios.privateKey
  );

const getApnsProviderToken = (ios) => {
  if (!apnsConfigured(ios)) return null;
  const now = Date.now();
  const configFingerprint = fingerprint([
    ios.teamId,
    ios.keyId,
    ios.bundleId,
    ios.privateKey,
    ios.environment,
  ]);
  if (
    apnsProviderTokenCache &&
    apnsProviderTokenCache.fingerprint === configFingerprint &&
    apnsProviderTokenCache.expiresAt - 60_000 > now
  ) {
    return apnsProviderTokenCache.token;
  }

  const token = jwt.sign({}, restorePem(ios.privateKey), {
    algorithm: 'ES256',
    issuer: ios.teamId,
    header: {
      alg: 'ES256',
      kid: ios.keyId,
    },
  });
  apnsProviderTokenCache = {
    token,
    fingerprint: configFingerprint,
    expiresAt: now + 50 * 60 * 1000,
  };
  return token;
};

const sendApns = async (device, call, ios) => {
  const providerToken = getApnsProviderToken(ios);
  if (!providerToken) return { ok: false, skipped: true, reason: 'apns_not_configured' };

  const production = String(ios.environment || 'production').toLowerCase() === 'production';
  const origin = production
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
  const isVoip = device.tokenType === 'voip';
  const topic = isVoip ? `${ios.bundleId}.voip` : ios.bundleId;
  const data = buildCallData(call);
  const expiresAt =
    Math.floor(Date.now() / 1000) +
    Math.max(10, Number(call.ringingTimeoutSec || 45));
  const body = JSON.stringify({
    aps: isVoip
      ? { 'content-available': 1 }
      : {
          alert: {
            title: call.mediaType === 'video' ? 'Video call' : 'Voice call',
            body: `${call.fromName || call.fromUsername || 'Someone'} is calling you`,
          },
          sound: 'default',
          category: 'SYNCCHAT_INCOMING_CALL',
        },
    ...data,
  });

  return new Promise((resolve) => {
    const client = http2.connect(origin);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        client.close();
      } catch (error0) {}
      resolve(result);
    };

    client.on('error', (error0) => {
      finish({ ok: false, message: error0.message || 'APNs connection failed' });
    });

    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${device.token}`,
      authorization: `bearer ${providerToken}`,
      'apns-topic': topic,
      'apns-push-type': isVoip ? 'voip' : 'alert',
      'apns-priority': '10',
      'apns-expiration': String(expiresAt),
      'content-type': 'application/json',
    });

    let status = 0;
    let responseBody = '';
    request.setEncoding('utf8');
    request.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
    });
    request.on('data', (chunk) => {
      responseBody += chunk;
    });
    request.on('error', (error0) => {
      finish({ ok: false, message: error0.message || 'APNs request failed' });
    });
    request.on('end', async () => {
      if (status >= 200 && status < 300) {
        finish({ ok: true });
        return;
      }
      const payload = (() => {
        try {
          return JSON.parse(responseBody || '{}');
        } catch (error0) {
          return {};
        }
      })();
      const reason =
        payload.reason || `APNs request failed with ${status || 'unknown status'}`;
      const unregister = status === 410 || /BadDeviceToken|Unregistered/i.test(reason);
      if (unregister) await device.destroy().catch(() => {});
      finish({ ok: false, unregister, status, message: reason });
    });
    request.end(body);
  });
};

const sendNativeCallPush = async ({ userIds, call }) => {
  const [devices, providerConfig] = await Promise.all([
    getEligibleDevices(userIds),
    getNativePushConfig(),
  ]);
  if (!devices.length) return { sent: 0, attempted: 0, skipped: 0 };

  const results = await Promise.allSettled(
    devices.map(async (device) => {
      const result =
        device.provider === 'apns'
          ? await sendApns(device, call, providerConfig.ios)
          : await sendFcm(device, call, providerConfig.android);
      if (!result.ok && !result.skipped) {
        logger.warn('NATIVE_CALL_PUSH_ERROR', {
          userId: device.userId,
          platform: device.platform,
          provider: device.provider,
          status: result.status,
          message: result.message,
        });
      }
      return result;
    })
  );

  const sent = results.filter(
    (result) => result.status === 'fulfilled' && result.value?.ok
  ).length;
  const skipped = results.filter(
    (result) => result.status === 'fulfilled' && result.value?.skipped
  ).length;
  return { sent, attempted: devices.length, skipped };
};

module.exports = {
  sendNativeCallPush,
  fcmConfigured,
  apnsConfigured,
};
