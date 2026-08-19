const { getActiveCallByRoom } = require('../../helpers/callState');
const logger = require('../../helpers/logger');

const INFLIGHT_DEDUPE_MS = 2000;
const RECENT_START_TTL_MS = 2 * 60 * 1000;

const emitExistingStarted = (socket, current) => {
  socket.emit('call/started', {
    callId: current.callId,
    roomId: current.roomId,
    roomType: current.roomType,
    mediaType: current.mediaType,
  });
};

const attachCallRealtimeEvents = (socket) => {
  if (!socket || socket.__syncchatCallRealtime) return;
  socket.__syncchatCallRealtime = true;

  const listeners = socket.listeners('call/start');
  if (listeners.length) {
    const original = listeners[0];
    const recentStarts = new Map();
    socket.removeAllListeners('call/start');

    socket.on('call/start', async (rawArgs = {}) => {
      const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};
      const fromUserId = socket.userId || args.fromUserId;
      const roomId = String(args.roomId || '');
      const mediaType = args.mediaType === 'video' ? 'video' : 'audio';
      if (!roomId || !fromUserId) return;

      const key = `${roomId}:${fromUserId}:${mediaType}`;
      const now = Date.now();
      const previous = Number(recentStarts.get(key) || 0);

      if (previous) {
        const current = await getActiveCallByRoom(roomId).catch(() => null);
        if (
          current?.initiatorId === fromUserId &&
          current?.mediaType === mediaType
        ) {
          emitExistingStarted(socket, current);
          return;
        }

        // Only suppress a duplicate while the first call/start handler is
        // still reserving state. If the first attempt failed, allow a retry.
        if (now - previous < INFLIGHT_DEDUPE_MS) return;
      }

      recentStarts.set(key, now);
      for (const [entryKey, timestamp] of recentStarts.entries()) {
        if (now - timestamp >= RECENT_START_TTL_MS) recentStarts.delete(entryKey);
      }

      await original({
        ...args,
        fromUserId,
        mediaType,
      });
    });

    listeners.slice(1).forEach((listener) => socket.on('call/start', listener));
  }

  // When an outgoing call is signalled before getUserMedia finishes, a very
  // fast recipient can join first. Once the initiator's media is ready and it
  // joins, replay already-joined recipients so WebRTC offer creation cannot be
  // missed because of that race.
  socket.on('call/join', async ({ callId, roomId, userId, mediaType }) => {
    const joiningUserId = socket.userId || userId;
    if ((!callId && !roomId) || !joiningUserId) return;

    try {
      // Let the primary calling handler process the same join event first.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const state = roomId
        ? await getActiveCallByRoom(roomId)
        : null;
      if (!state || state.initiatorId !== joiningUserId) return;

      const joinedRecipients = (Array.isArray(state.joinedUserIds)
        ? state.joinedUserIds
        : []
      ).filter((id) => id && id !== joiningUserId);

      joinedRecipients.forEach((joinedUserId) => {
        socket.emit('call/user-joined', {
          callId: state.callId,
          roomId: state.roomId,
          userId: joinedUserId,
          mediaType: mediaType === 'video' ? 'video' : state.mediaType,
          catchUp: true,
        });
      });
    } catch (error0) {
      logger.warn('CALL_REALTIME_CATCHUP_ERROR', {
        roomId: roomId || null,
        userId: joiningUserId,
        message: error0.message,
      });
    }
  });
};

module.exports = attachCallRealtimeEvents;
