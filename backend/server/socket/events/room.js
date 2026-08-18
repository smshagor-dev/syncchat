const { io } = global;
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const ProfileModel = require('../../db/models/profile');
const { asArray, toPlain } = require('../../db/utils');
const Inbox = require('../../helpers/models/inbox');
const { getCallConfig } = require('../../helpers/callConfig');

const activeCalls = new Map();
const activeCallByUserId = new Map();
const socketCallRoomById = new Map();
const socketUserById = new Map();

const formatCallDuration = (ms) => {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min} min ${sec} sec`;
  return `${sec} sec`;
};

const mediaLabel = (mediaType) =>
  mediaType === 'video' ? 'Video' : 'Voice';

const unique = (values) => [...new Set(asArray(values).filter(Boolean))];

const emitCallLog = async ({ roomId, userId, text }) => {
  if (!roomId || !text) return;

  const inboxDoc = await InboxModel.findOne({ where: { roomId } });
  const inboxPlain = toPlain(inboxDoc);
  if (!inboxPlain) return;

  const ownersId = asArray(inboxPlain.ownersId);
  const authorId = userId || ownersId[0];
  if (!authorId) return;

  const chatDoc = await ChatModel.create({
    userId: authorId,
    roomId,
    text,
    replyTo: null,
    fileId: null,
    readed: false,
    delivered: false,
    deletedBy: [],
    reactions: {},
  });
  const chat = toPlain(chatDoc);

  const profileDoc = await ProfileModel.findOne({
    where: { userId: authorId },
    attributes: ['userId', 'avatar', 'fullname'],
  });
  const profile = toPlain(profileDoc);

  await inboxDoc.update({
    unreadMessage: Number(inboxPlain.unreadMessage || 0) + 1,
    content: {
      from: authorId,
      senderName: profile?.fullname || '',
      text,
      time: chat.createdAt,
      delivered: false,
      readed: false,
    },
  });

  const inboxes = await Inbox.find({ roomId });
  io.to(roomId).emit('chat/insert', {
    ...chat,
    profile,
    file: null,
    reply: null,
  });
  if (inboxes[0]) {
    io.to(ownersId).emit('inbox/find', inboxes[0]);
  }
};

const clearRingTimer = (state) => {
  if (state?.ringTimer) {
    clearTimeout(state.ringTimer);
    state.ringTimer = null;
  }
};

const releaseCallState = (roomId) => {
  const state = activeCalls.get(roomId);
  if (!state) return null;

  clearRingTimer(state);
  unique([
    state.initiatorId,
    ...(state.recipientsId || []),
    ...(state.joinedUserIds || []),
  ]).forEach((userId) => {
    if (activeCallByUserId.get(userId) === roomId) {
      activeCallByUserId.delete(userId);
    }
  });
  activeCalls.delete(roomId);
  return state;
};

const markUsersBusy = (roomId, userIds) => {
  unique(userIds).forEach((userId) => {
    activeCallByUserId.set(userId, roomId);
  });
};

const getTargets = async ({ roomId, fromUserId, recipientsId }) => {
  const explicit = unique(recipientsId).filter(
    (ownerId) => ownerId !== fromUserId
  );
  if (explicit.length) return explicit;

  const inboxDoc = await InboxModel.findOne({ where: { roomId } });
  const inboxPlain = toPlain(inboxDoc);
  return unique(inboxPlain?.ownersId).filter(
    (ownerId) => ownerId !== fromUserId
  );
};

const emitCallError = (userId, roomId, message, code = 'CALL_NOT_ALLOWED') => {
  io.to(userId).emit('call/error', { roomId, message, code });
};

const callAllowed = (config, { mediaType, roomType, participantCount }) => {
  if (!config.enabled) return 'Calling is disabled by the administrator';
  if (mediaType === 'video' && !config.videoEnabled) {
    return 'Video calling is disabled by the administrator';
  }
  if (mediaType !== 'video' && !config.audioEnabled) {
    return 'Audio calling is disabled by the administrator';
  }
  if (roomType === 'group' && !config.groupEnabled) {
    return 'Group calling is disabled by the administrator';
  }
  if (
    roomType === 'group' &&
    participantCount > Number(config.maxGroupParticipants || 4)
  ) {
    return `Group calls are limited to ${config.maxGroupParticipants || 4} participants`;
  }
  return '';
};

module.exports = (socket) => {
  const getCallRoom = (roomId) => `call:${roomId}`;

  socket.on('room/open', (args) => {
    if (args.prevRoom) socket.leave(args.prevRoom);
    socket.join(args.newRoom);
    io.to(args.newRoom).emit('room/open', args.newRoom);
  });

  socket.on(
    'call/start',
    async ({
      roomId,
      roomType,
      fromUserId,
      mediaType,
      fromName = '',
      fromUsername = '',
      recipientsId = [],
    }) => {
      if (!roomId || !fromUserId) return;

      try {
        const config = await getCallConfig();
        const normalizedMediaType = mediaType === 'video' ? 'video' : 'audio';
        const targets = await getTargets({
          roomId,
          fromUserId,
          recipientsId,
        });
        const normalizedRoomType =
          roomType === 'group' || targets.length > 1 ? 'group' : 'private';

        const denied = callAllowed(config, {
          mediaType: normalizedMediaType,
          roomType: normalizedRoomType,
          participantCount: targets.length + 1,
        });
        if (denied) {
          emitCallError(fromUserId, roomId, denied);
          return;
        }

        const callerBusyRoom = activeCallByUserId.get(fromUserId);
        if (callerBusyRoom && callerBusyRoom !== roomId) {
          io.to(fromUserId).emit('call/busy', {
            roomId,
            userId: fromUserId,
            reason: 'caller-busy',
          });
          return;
        }

        const busyTargets = targets.filter((targetId) => {
          const activeRoom = activeCallByUserId.get(targetId);
          return activeRoom && activeRoom !== roomId;
        });
        const availableTargets = targets.filter(
          (targetId) => !busyTargets.includes(targetId)
        );

        if (normalizedRoomType === 'private' && busyTargets.length) {
          await emitCallLog({
            roomId,
            userId: fromUserId,
            text: `${mediaLabel(normalizedMediaType)} call busy`,
          }).catch(() => {});
          io.to(fromUserId).emit('call/busy', {
            roomId,
            busyUserIds: busyTargets,
            reason: 'recipient-busy',
          });
          return;
        }

        if (!availableTargets.length) {
          io.to(fromUserId).emit('call/busy', {
            roomId,
            busyUserIds: busyTargets,
            reason: 'all-recipients-busy',
          });
          return;
        }

        if (activeCalls.has(roomId)) {
          emitCallError(
            fromUserId,
            roomId,
            'A call is already active in this room',
            'CALL_ALREADY_ACTIVE'
          );
          return;
        }

        const state = {
          roomId,
          roomType: normalizedRoomType,
          mediaType: normalizedMediaType,
          initiatorId: fromUserId,
          fromName,
          fromUsername,
          recipientsId: availableTargets,
          rejectedUserIds: [],
          joinedUserIds: [fromUserId],
          ringingAt: Date.now(),
          acceptedAt: null,
          startedAt: null,
          connectedLogged: false,
          ringTimer: null,
        };

        const timeoutMs =
          Math.max(10, Number(config.ringingTimeoutSec || 45)) * 1000;
        state.ringTimer = setTimeout(async () => {
          const current = activeCalls.get(roomId);
          if (!current || current.startedAt) return;

          await emitCallLog({
            roomId,
            userId: fromUserId,
            text: `Missed ${mediaLabel(normalizedMediaType).toLowerCase()} call`,
          }).catch(() => {});

          io.to(fromUserId).emit('call/missed', {
            roomId,
            reason: 'timeout',
          });
          io.to(current.recipientsId).emit('call/missed', {
            roomId,
            reason: 'timeout',
          });
          io.to(getCallRoom(roomId)).emit('call/missed', {
            roomId,
            reason: 'timeout',
          });
          releaseCallState(roomId);
        }, timeoutMs);

        activeCalls.set(roomId, state);
        markUsersBusy(roomId, [fromUserId, ...availableTargets]);

        await emitCallLog({
          roomId,
          userId: fromUserId,
          text: `${mediaLabel(normalizedMediaType)} call started`,
        });

        io.to(availableTargets).emit('call/incoming', {
          roomId,
          roomType: normalizedRoomType,
          fromUserId,
          fromName,
          fromUsername,
          mediaType: normalizedMediaType,
          ringingTimeoutSec: config.ringingTimeoutSec,
        });

        if (busyTargets.length) {
          io.to(fromUserId).emit('call/busy-participants', {
            roomId,
            busyUserIds: busyTargets,
          });
        }
      } catch (error0) {
        emitCallError(
          fromUserId,
          roomId,
          error0.message || 'Unable to start call',
          'CALL_START_FAILED'
        );
      }
    }
  );

  socket.on('call/join', async ({ roomId, userId, mediaType }) => {
    if (!roomId || !userId) return;

    const callRoom = getCallRoom(roomId);
    socket.join(callRoom);
    socketCallRoomById.set(socket.id, roomId);
    socketUserById.set(socket.id, userId);

    const state = activeCalls.get(roomId);
    if (!state) {
      // The caller can join the socket room a moment before async call/start
      // finishes policy/recipient checks. call/start will own lifecycle state.
      return;
    }

    if (!state.joinedUserIds.includes(userId)) {
      state.joinedUserIds.push(userId);
    }
    markUsersBusy(roomId, [userId]);

    const isRecipient = userId !== state.initiatorId;
    if (isRecipient && !state.startedAt) {
      clearRingTimer(state);
      state.acceptedAt = Date.now();
      state.startedAt = state.acceptedAt;
      activeCalls.set(roomId, state);

      io.to(state.initiatorId).emit('call/accepted', {
        roomId,
        userId,
      });
      io.to(callRoom).emit('call/connected', {
        roomId,
        acceptedBy: userId,
      });

      if (!state.connectedLogged) {
        state.connectedLogged = true;
        activeCalls.set(roomId, state);
        await emitCallLog({
          roomId,
          userId,
          text: `${mediaLabel(state.mediaType)} call connected`,
        });
      }
    }

    socket.to(callRoom).emit('call/user-joined', {
      roomId,
      userId,
      mediaType: mediaType === 'video' ? 'video' : 'audio',
    });
  });

  socket.on('call/accept', ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    const state = activeCalls.get(roomId);
    if (!state) return;
    clearRingTimer(state);
    if (!state.acceptedAt) state.acceptedAt = Date.now();
    activeCalls.set(roomId, state);
    io.to(state.initiatorId).emit('call/accepted', {
      roomId,
      userId,
    });
  });

  socket.on('call/leave', ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    const callRoom = getCallRoom(roomId);
    socket.leave(callRoom);
    socketCallRoomById.delete(socket.id);
    socket.to(callRoom).emit('call/user-left', { roomId, userId });
  });

  socket.on('call/cancel', async ({ roomId, userId, reason = 'cancelled' }) => {
    if (!roomId || !userId) return;
    const state = activeCalls.get(roomId);
    if (!state || state.initiatorId !== userId) return;

    await emitCallLog({
      roomId,
      userId,
      text:
        reason === 'timeout'
          ? `No answer for ${mediaLabel(state.mediaType).toLowerCase()} call`
          : `${mediaLabel(state.mediaType)} call cancelled`,
    }).catch(() => {});

    io.to(state.recipientsId).emit(
      reason === 'timeout' ? 'call/missed' : 'call/cancelled',
      { roomId, userId, reason }
    );
    io.to(getCallRoom(roomId)).emit(
      reason === 'timeout' ? 'call/missed' : 'call/cancelled',
      { roomId, userId, reason }
    );
    releaseCallState(roomId);
  });

  socket.on('call/end', async ({ roomId, userId, reason = 'ended' }) => {
    if (!roomId || !userId) return;

    const callRoom = getCallRoom(roomId);
    const state = activeCalls.get(roomId);
    if (state) {
      const hasStarted = Number.isFinite(state.startedAt);
      const duration = hasStarted
        ? formatCallDuration(Date.now() - state.startedAt)
        : '0 sec';

      await emitCallLog({
        roomId,
        userId,
        text: hasStarted
          ? `${mediaLabel(state.mediaType)} call ended (${duration})`
          : `${mediaLabel(state.mediaType)} call ended`,
      }).catch(() => {});
      releaseCallState(roomId);
    }

    socketCallRoomById.delete(socket.id);
    io.to(callRoom).emit('call/ended', {
      roomId,
      userId,
      reason,
    });
  });

  socket.on('call/reject', async ({ roomId, fromUserId, toUserId }) => {
    if (!roomId || !fromUserId || !toUserId) return;

    const state = activeCalls.get(roomId);
    if (!state) return;

    if (!state.rejectedUserIds.includes(fromUserId)) {
      state.rejectedUserIds.push(fromUserId);
    }
    if (activeCallByUserId.get(fromUserId) === roomId) {
      activeCallByUserId.delete(fromUserId);
    }

    await emitCallLog({
      roomId,
      userId: fromUserId,
      text: `Rejected ${mediaLabel(state.mediaType)} call`,
    }).catch(() => {});

    io.to(toUserId).emit('call/rejected', {
      roomId,
      fromUserId,
      toUserId,
    });

    const remaining = state.recipientsId.filter(
      (id) => !state.rejectedUserIds.includes(id)
    );
    if (state.roomType === 'private' || remaining.length === 0) {
      releaseCallState(roomId);
      io.to(getCallRoom(roomId)).emit('call/ended', {
        roomId,
        userId: fromUserId,
        reason: 'rejected',
      });
    } else {
      activeCalls.set(roomId, state);
    }
  });

  socket.on('call/signal', ({ roomId, fromUserId, toUserId, signal }) => {
    if (!roomId || !fromUserId || !toUserId || !signal) return;
    const state = activeCalls.get(roomId);
    if (!state) return;
    io.to(toUserId).emit('call/signal', {
      roomId,
      fromUserId,
      signal,
    });
  });

  socket.on('disconnect', () => {
    const callRoomId = socketCallRoomById.get(socket.id);
    const userId = socketUserById.get(socket.id);

    if (callRoomId && userId) {
      io.to(getCallRoom(callRoomId)).emit('call/user-left', {
        roomId: callRoomId,
        userId,
        reason: 'socket-disconnected',
      });
    }

    socketCallRoomById.delete(socket.id);
    socketUserById.delete(socket.id);
  });
};
