const http2 = require('http2');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const NativePushDeviceModel = require('../db/models/nativePushDevice');
const SettingModel = require('../db/models/setting');
const { toPlainMany } = require('../db/utils');
const logger = require('./logger');

let fcmTokenCache = null;
let apnsProviderTokenCache = null;

const uniq = (values) => [...new Set((values || []).filter(Boolean))];
const env = (name) => String(process.env[name] || '').trim();
const restorePem = (value) => String(value || '').replace(/\\n/g, '\n');

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

const fcmConfigured = () =>
  Boolean(env('FCM_PROJECT_ID') && env('FCM_CLIENT_EMAIL') && env('FCM_PRIVATE_KEY'));

const getFcmAccessToken = async () => {
  const now = Date.now();
  if (fcmTokenCache && fcmTokenCache.expiresAt - 60_000 > now) {
    return fcmTokenCache.token;
  }
  if (!fcmConfigured()) return null;

  const issuedAt = Math.floor(now / 1000);
  const assertion = jwt.sign(
    {
      iss: env('FCM_CLIENT_EMAIL'),
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: issuedAt,
      exp: issuedAt + 3600,
    },
    restorePem(env('FCM_PRIVATE_KEY')),
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
    const error = new Error(payload.error_description || payload.error || 'Unable to authenticate FCM');
    error.statusCode = response.status;
    throw error;
  }

  fcmTokenCache = {
    token: payload.access_token,
    expiresAt: now + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
  };
  return fcmTokenCache.token;
};

const sendFcm = async (device, call) => {
  const accessToken = await getFcmAccessToken();
  if (!accessToken) return { ok: false, skipped: true, reason: 'fcm_missing' };

  const data = buildCallData(call);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env('FCM_PROJECT_ID'))}/messages:send`,
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

const apnsConfigured = () =>
  Boolean(
    env('APNS_TEAM_ID') &&
      env('APNS_KEY_ID') &&
      env('APNS_BUNDLE_ID') &&
      env('APNS_PRIVATE_KEY')
  );

const getApnsProviderToken = () => {
  const now = Date.now();
  if (apnsProviderTokenCache && apnsProviderTokenCache.expiresAt - 60_000 > now) {
    return apnsProviderTokenCache.token;
  }
  if (!apnsConfigured()) return null;

  const token = jwt.sign({}, restorePem(env('APNS_PRIVATE_KEY')), {
    algorithm: 'ES256',
    issuer: env('APNS_TEAM_ID'),
    header: {
      alg: 'ES256',
      kid: env('APNS_KEY_ID'),
    },
  });
  apnsProviderTokenCache = {
    token,
    expiresAt: now + 50 * 60 * 1000,
  };
  return token;
};

const sendApns = async (device, call) => {
  const providerToken = getApnsProviderToken();
  if (!providerToken) return { ok: false, skipped: true, reason: 'apns_missing' };

  const production = env('APNS_ENVIRONMENT').toLowerCase() === 'production';
  const origin = production
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
  const isVoip = device.tokenType === 'voip';
  const topic = isVoip ? `${env('APNS_BUNDLE_ID')}.voip` : env('APNS_BUNDLE_ID');
  const data = buildCallData(call);
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(10, Number(call.ringingTimeoutSec || 45));
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
      const reason = payload.reason || `APNs request failed with ${status || 'unknown status'}`;
      const unregister = status === 410 || /BadDeviceToken|Unregistered/i.test(reason);
      if (unregister) await device.destroy().catch(() => {});
      finish({ ok: false, unregister, status, message: reason });
    });
    request.end(body);
  });
};

const sendNativeCallPush = async ({ userIds, call }) => {
  const devices = await getEligibleDevices(userIds);
  if (!devices.length) return { sent: 0, attempted: 0 };

  const results = await Promise.allSettled(
    devices.map(async (device) => {
      const result =
        device.provider === 'apns'
          ? await sendApns(device, call)
          : await sendFcm(device, call);
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
