const webpush = require('web-push');
const { Op } = require('sequelize');
const PushSubscriptionModel = require('../db/models/pushSubscription');
const SettingModel = require('../db/models/setting');
const { toPlainMany } = require('../db/utils');
const logger = require('./logger');

const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT =
  String(process.env.VAPID_SUBJECT || '').trim() ||
  'mailto:support@syncchat.app';

let vapidConfigured = false;

const ensureVapidConfigured = () => {
  if (vapidConfigured) return true;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
  return true;
};

const shouldNotifyCategory = (setting, category) => {
  if (!setting) return true;
  if (setting.mute) return false;
  if (setting.showPushNotification === false) return false;
  if (category === 'message') return setting.notifyMessages !== false;
  if (category === 'group') return setting.notifyGroups !== false;
  if (category === 'status') return setting.notifyStatus !== false;
  if (category === 'call') return setting.notifyCalls !== false;
  return true;
};

const resolveBody = (setting, preview, fallback) => {
  const previewsEnabled = setting?.showNotificationPreviews !== false;
  if (!previewsEnabled) return fallback || 'Open SyncChat to view';
  return preview || fallback || 'Open SyncChat to view';
};

const buildSubscriptionPayload = (subscriptionRow) => ({
  endpoint: subscriptionRow.endpoint,
  expirationTime: subscriptionRow.expirationTime || null,
  keys: {
    p256dh: subscriptionRow.p256dh,
    auth: subscriptionRow.auth,
  },
});

const uniq = (values) => [...new Set(values)];

const sendPushToUsers = async ({
  userIds,
  title,
  preview,
  fallback,
  category = 'message',
  url = '/',
  data = {},
}) => {
  const targets = uniq((userIds || []).filter(Boolean));
  if (targets.length === 0) return { sent: 0, skipped: 0 };
  if (!ensureVapidConfigured()) {
    return { sent: 0, skipped: targets.length, reason: 'vapid_missing' };
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
      'notifyCalls',
      'showNotificationPreviews',
    ],
  });
  const settings = toPlainMany(settingsRaw);
  const settingMap = new Map(settings.map((item) => [item.userId, item]));

  const eligible = targets.filter((userId) =>
    shouldNotifyCategory(settingMap.get(userId), category)
  );
  if (eligible.length === 0) {
    return { sent: 0, skipped: targets.length };
  }

  const subscriptions = await PushSubscriptionModel.findAll({
    where: { userId: { [Op.in]: eligible } },
  });

  if (!subscriptions.length) {
    return { sent: 0, skipped: eligible.length };
  }

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const setting = settingMap.get(sub.userId);
      const body = resolveBody(setting, preview, fallback);
      const payload = JSON.stringify({
        title: title || 'SyncChat',
        body,
        url,
        category,
        data,
      });

      try {
        await webpush.sendNotification(buildSubscriptionPayload(sub), payload);
        return { ok: true };
      } catch (error0) {
        const status = error0?.statusCode || error0?.status;
        if (status === 404 || status === 410) {
          await sub.destroy().catch(() => {});
          return { ok: false, removed: true };
        }
        logger.warn('PUSH_SEND_ERROR', {
          userId: sub.userId,
          status,
          message: error0?.message || 'Push send failed',
        });
        return { ok: false, error: error0?.message || 'Push send failed' };
      }
    })
  );

  const sent = results.filter(
    (result) => result.status === 'fulfilled' && result.value?.ok
  ).length;
  return { sent, attempted: subscriptions.length };
};

module.exports = {
  getPublicVapidKey: () => VAPID_PUBLIC_KEY,
  sendPushToUsers,
};
