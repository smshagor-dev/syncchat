const ChannelAnalyticsEventModel = require('../db/models/channelAnalyticsEvent');

const ALLOWED_EVENT_TYPES = new Set([
  'subscriber_join',
  'subscriber_leave',
  'subscriber_mute',
  'subscriber_unmute',
]);

const trackChannelEvent = async ({
  channelId,
  userId = null,
  eventType,
  meta = {},
}) => {
  if (!channelId || !ALLOWED_EVENT_TYPES.has(eventType)) return null;

  try {
    return await ChannelAnalyticsEventModel.create({
      channelId,
      userId: userId || null,
      eventType,
      meta: meta && typeof meta === 'object' ? meta : {},
    });
  } catch (error0) {
    return null;
  }
};

module.exports = {
  trackChannelEvent,
};
