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

const shouldNotifyCategory = (setting, category) => {
  if (!setting) return true;
  if (setting.mute) return false;
  if (setting.showPushNotification === false) return false;
  if (category === 'message') return setting.notifyMessages !== false;
  if (category === 'group') return setting.notifyGroups !== false;
  if (category === 'status') return setting.notifyStatus !== false;
  return category !== 'call';
};

const resolveBody = (setting, preview, fallback) => {
  if (setting?.showNotificationPreviews === false) {
    return fallback || 'Open SyncChat to view';
  }
  return preview || fallback || 'Open SyncChat to view';
};

const getEligibleDevices = async ({ userIds, category }) => {
  const targets = uniq(userIds);
  if (!targets.length || category === 'call') {
    return { devices: [], settingMap: new Map(), skipped: targets.length };
  }

  const settingsRaw = await SettingModel.findAll({
    where: { userId: { [Op.in]: targets } },
    attributes: [
      'userId',
      'mute',
      'showPushNotification',
      'notifyMessages',
      'notifyGroups',
      'notifyStatus',
      'showNotificationPreviews',
    ],
  });
  const settings = toPlainMany(settingsRaw);
  const settingMap = new Map(settings.map((item) => [item.userId, item]));
  const eligible = targets.filter((userId) =>
    shouldNotifyCategory(settingMap.get(userId), category)
  );
  if (!eligible.length) {
    return { devices: [], settingMap, skipped: targets.length };
  }

  const devices = await NativePushDeviceModel.findAll({
    where: {
      userId: { [Op.in]: eligible },
      enabled: true,
      tokenType: 'standard',
    },
  });
  return {
    devices,
    settingMap,
    skipped: Math.max(0, targets.length - eligible.length),
  };
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
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });
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

const stringifyData = (value) =>
  Object.fromEntries(
    Object.entries(value || {}).map(([key, item]) => [key, String(item ?? '')])
  );

const sendFcm = async ({ device, title, body, category, data, android }) => {
  const accessToken = await getFcmAccessToken(android);
  if (!accessToken) {
    return { ok: false, skipped: true, reason: 'fcm_not_configured' };
  }
  const roomId = String(data?.roomId || '');
  const payloadData = stringifyData({
    type: 'message',
    category,
    title,
    body,
    ...data,
  });
  const notification = {
    channel_id: 'syncchat_messages',
    sound: 'default',
    ...(roomId ? { tag: `syncchat_room_${roomId}` } : {}),
  };

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
          notification: { title, body },
          data: payloadData,
          android: {
            priority: 'high',
            ttl: '3600s',
            notification,
          },
        },
      }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (response.ok) return { ok: true };

  const message = payload?.error?.message || `FCM request failed with ${response.status}`;
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
    header: { alg: 'ES256', kid: ios.keyId },
  });
  apnsProviderTokenCache = {
    token,
    fingerprint: configFingerprint,
    expiresAt: now + 50 * 60 * 1000,
  };
  return token;
};

const sendApns = async ({ device, title, body, category, data, ios }) => {
  const providerToken = getApnsProviderToken(ios);
  if (!providerToken) {
    return { ok: false, skipped: true, reason: 'apns_not_configured' };
  }
  const production = String(ios.environment || 'production').toLowerCase() === 'production';
  const origin = production
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
  const roomId = String(data?.roomId || '');
  const payloadData = stringifyData({
    type: 'message',
    category,
    title,
    body,
    ...data,
  });
  const payload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: 'default',
      ...(roomId ? { 'thread-id': `syncchat_room_${roomId}` } : {}),
    },
    ...payloadData,
  });
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

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
      'apns-topic': ios.bundleId,
      'apns-push-type': 'alert',
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
      const responsePayload = (() => {
        try {
          return JSON.parse(responseBody || '{}');
        } catch (error0) {
          return {};
        }
      })();
      const reason =
        responsePayload.reason || `APNs request failed with ${status || 'unknown status'}`;
      const unregister = status === 410 || /BadDeviceToken|Unregistered/i.test(reason);
      if (unregister) await device.destroy().catch(() => {});
      finish({ ok: false, unregister, status, message: reason });
    });
    request.end(payload);
  });
};

const sendNativeMessagePush = async ({
  userIds,
  title,
  preview,
  fallback,
  category = 'message',
  data = {},
}) => {
  if (category === 'call') return { sent: 0, attempted: 0, skipped: 0 };
  const { devices, settingMap, skipped } = await getEligibleDevices({
    userIds,
    category,
  });
  if (!devices.length) {
    return { sent: 0, attempted: 0, skipped };
  }

  const providerConfig = await getNativePushConfig();
  const results = await Promise.allSettled(
    devices.map(async (device) => {
      const body = resolveBody(settingMap.get(device.userId), preview, fallback);
      const result =
        device.provider === 'apns'
          ? await sendApns({
              device,
              title: title || 'SyncChat',
              body,
              category,
              data,
              ios: providerConfig.ios,
            })
          : await sendFcm({
              device,
              title: title || 'SyncChat',
              body,
              category,
              data,
              android: providerConfig.android,
            });
      if (!result.ok && !result.skipped) {
        logger.warn('NATIVE_MESSAGE_PUSH_ERROR', {
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
  const providerSkipped = results.filter(
    (result) => result.status === 'fulfilled' && result.value?.skipped
  ).length;
  return {
    sent,
    attempted: devices.length,
    skipped: skipped + providerSkipped,
  };
};

module.exports = {
  sendNativeMessagePush,
  shouldNotifyCategory,
  resolveBody,
  fcmConfigured,
  apnsConfigured,
};
