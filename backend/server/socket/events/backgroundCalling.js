const { getActiveCallByRoom } = require('../../helpers/callState');
const { sendPushToUsers } = require('../../helpers/pushNotifications');
const { sendNativeCallPush } = require('../../helpers/nativePush');
const logger = require('../../helpers/logger');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForCallState = async ({ roomId, fromUserId, eventAt }) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const state = await getActiveCallByRoom(roomId).catch(() => null);
    const ringingAt = Number(state?.ringingAt || 0);
    const isFresh = ringingAt >= eventAt - 5000;
    if (
      state?.initiatorId === fromUserId &&
      isFresh &&
      !state.startedAt &&
      !state.acceptedAt
    ) {
      return state;
    }
    await sleep(125);
  }
  return null;
};

const buildIncomingCall = (state) => ({
  callId: state.callId,
  roomId: state.roomId,
  roomType: state.roomType || 'private',
  mediaType: state.mediaType === 'video' ? 'video' : 'audio',
  fromUserId: state.initiatorId,
  fromName: state.fromName || '',
  fromUsername: state.fromUsername || '',
  ringingTimeoutSec: Math.max(10, Number(state.ringingTimeoutSec || 45)),
});

module.exports = (socket) => {
  socket.on('call/start', async ({ roomId, fromUserId }) => {
    if (!roomId || !fromUserId) return;

    const eventAt = Date.now();
    try {
      const state = await waitForCallState({ roomId, fromUserId, eventAt });
      if (
        !state?.callId ||
        !Array.isArray(state.recipientsId) ||
        !state.recipientsId.length
      ) {
        return;
      }

      const call = buildIncomingCall(state);
      const title = call.mediaType === 'video' ? 'Video call' : 'Voice call';
      const caller =
        call.fromName || (call.fromUsername ? `@${call.fromUsername}` : 'Someone');
      const preview = `${caller} is calling you`;
      const webData = {
        type: 'incoming_call',
        call,
      };

      const [webResult, nativeResult] = await Promise.allSettled([
        sendPushToUsers({
          userIds: state.recipientsId,
          title,
          preview,
          fallback: 'You have an incoming call',
          category: 'call',
          url: '/',
          data: webData,
        }),
        sendNativeCallPush({
          userIds: state.recipientsId,
          call,
        }),
      ]);

      logger.info('CALL_BACKGROUND_PUSH', {
        callId: state.callId,
        roomId: state.roomId,
        web:
          webResult.status === 'fulfilled'
            ? webResult.value
            : { error: webResult.reason?.message || 'web push failed' },
        native:
          nativeResult.status === 'fulfilled'
            ? nativeResult.value
            : { error: nativeResult.reason?.message || 'native push failed' },
      });
    } catch (error0) {
      logger.warn('CALL_BACKGROUND_PUSH_ERROR', {
        roomId,
        fromUserId,
        message: error0.message || 'Unable to send incoming call push',
      });
    }
  });
};
