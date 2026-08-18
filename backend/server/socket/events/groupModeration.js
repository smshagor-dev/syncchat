const { io } = global;
const { getCallStateById, saveActiveCall } = require('../../helpers/callState');
const logger = require('../../helpers/logger');

const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];

module.exports = (socket) => {
  socket.on(
    'call/moderate',
    async ({ callId, userId, targetUserId, action }) => {
      if (!callId || !userId || !targetUserId) return;
      const normalizedAction = String(action || '').toLowerCase();
      if (!['mute', 'remove'].includes(normalizedAction)) return;

      try {
        const state = await getCallStateById(callId);
        if (!state || state.roomType !== 'group') return;
        if (state.initiatorId !== userId) {
          io.to(userId).emit('call/error', {
            callId,
            roomId: state.roomId,
            code: 'CALL_MODERATOR_REQUIRED',
            message: 'Only the group call host can moderate participants',
          });
          return;
        }
        if (
          targetUserId === userId ||
          !Array.isArray(state.participantIds) ||
          !state.participantIds.includes(targetUserId)
        ) {
          return;
        }

        if (normalizedAction === 'remove') {
          state.removedUserIds = unique([
            ...(state.removedUserIds || []),
            targetUserId,
          ]);
          await saveActiveCall(state);
        }

        io.to(targetUserId).emit('call/moderation', {
          callId,
          roomId: state.roomId,
          action: normalizedAction,
          byUserId: userId,
        });
        io.to(`call:${state.roomId}`).emit('call/moderation-applied', {
          callId,
          roomId: state.roomId,
          action: normalizedAction,
          targetUserId,
          byUserId: userId,
        });
      } catch (error0) {
        logger.warn('CALL_MODERATION_ERROR', {
          callId,
          userId,
          targetUserId,
          action: normalizedAction,
          message: error0.message,
        });
      }
    }
  );
};
