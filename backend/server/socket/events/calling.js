const { randomUUID: uuidv4 } = require('crypto');
const { io } = global;
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const ProfileModel = require('../../db/models/profile');
const { asArray, toPlain } = require('../../db/utils');
const Inbox = require('../../helpers/models/inbox');
const { getCallConfig } = require('../../helpers/callConfig');
const {
  getCallStateById,
  getActiveCallByRoom,
  getBusyCallId,
  saveActiveCall,
  reserveActiveCall,
  releaseUserBusy,
  releaseActiveCall,
} = require('../../helpers/callState');
const {
  createCallHistory,
  recordCallEvent,
  markFailedAttempt,
  markBusyAttempt,
} = require('../../helpers/callHistory');
const logger = require('../../helpers/logger');

const socketCallById = new Map();
const socketUserById = new Map();
const ringTimers = new Map();

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
const getCallRoom = (roomId) => `call:${roomId}`;

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
  if (inboxes[0]) io.to(ownersId).emit('inbox/find', inboxes[0]);
};

const clearRingTimer = (callId) => {
  const timer = ringTimers.get(callId);
  if (timer) clearTimeout(timer);
  ringTimers.delete(callId);
};

const resolveCallState = async ({ callId, roomId }) => {
  if (callId) {
    const state = await getCallStateById(callId);
    if (state) return state;
  }
  if (roomId) return getActiveCallByRoom(roomId);
  return null;
};

const releaseCall = async (state) => {
  if (!state) return null;
  clearRingTimer(state.callId);
  await releaseActiveCall(state);
  return state;
};

const startRingTimer = (state, timeoutMs) => {
  clearRingTimer(state.callId);
  const timer = setTimeout(async () => {
    try {
      const current = await getCallStateById(state.callId);
      if (!current || current.startedAt) return;

      await recordCallEvent({
        callId: current.callId,
        eventStatus: 'missed',
        userId: current.initiatorId,
        reason: 'timeout',
        patch: {
          endedAt: new Date(),
          endedBy: current.initiatorId,
          endReason: 'timeout',
          durationSec: 0,
        },
      }).catch(() => {});

      await emitCallLog({
        roomId: current.roomId,
        userId: current.initiatorId,
        text: `Missed ${mediaLabel(current.mediaType).toLowerCase()} call`,
      }).catch(() => {});

      const payload = {
        callId: current.callId,
        roomId: current.roomId,
        reason: 'timeout',
      };
      io.to(current.initiatorId).emit('call/missed', payload);
      io.to(current.recipientsId).emit('call/missed', payload);
      io.to(getCallRoom(current.roomId)).emit('call/missed', payload);
      await releaseCall(current);
    } catch (error0) {
      logger.error('CALL_RING_TIMEOUT_ERROR', {
        callId: state.callId,
        message: error0.message,
      });
    }
  }, timeoutMs);
  ringTimers.set(state.callId, timer);
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

const emitCallError = (
  userId,
  roomId,
  message,
  code = 'CALL_NOT_ALLOWED',
  callId = null
) => {
  io.to(userId).emit('call/error', { callId, roomId, message, code });
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

const safeFailedHistory = async (args) => {
  try {
    await markFailedAttempt(args);
  } catch (error0) {
    logger.error('CALL_HISTORY_FAILED_ATTEMPT_ERROR', {
      callId: args.callId,
      message: error0.message,
    });
  }
};

const safeBusyHistory = async (args) => {
  try {
    await markBusyAttempt(args);
  } catch (error0) {
    logger.error('CALL_HISTORY_BUSY_ATTEMPT_ERROR', {
      callId: args.callId,
      message: error0.message,
    });
  }
};

module.exports = (socket) => {
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

      const callId = uuidv4();
      let reservedState = null;
      let historyCreated = false;
      let config = null;
      const normalizedMediaType = mediaType === 'video' ? 'video' : 'audio';
      let normalizedRoomType = roomType === 'group' ? 'group' : 'private';
      let targets = [];

      try {
        config = await getCallConfig();
        targets = await getTargets({ roomId, fromUserId, recipientsId });
        normalizedRoomType =
          roomType === 'group' || targets.length > 1 ? 'group' : 'private';
        const allParticipantIds = unique([fromUserId, ...targets]);

        if (!targets.length) {
          const message = 'No call recipients are available';
          await safeFailedHistory({
            callId,
            roomId,
            roomType: normalizedRoomType,
            mediaType: normalizedMediaType,
            initiatorId: fromUserId,
            participantIds: allParticipantIds,
            ringingTimeoutSec: config.ringingTimeoutSec,
            code: 'NO_RECIPIENTS',
            message,
          });
          emitCallError(fromUserId, roomId, message, 'NO_RECIPIENTS', callId);
          return;
        }

        const denied = callAllowed(config, {
          mediaType: normalizedMediaType,
          roomType: normalizedRoomType,
          participantCount: targets.length + 1,
        });
        if (denied) {
          await safeFailedHistory({
            callId,
            roomId,
            roomType: normalizedRoomType,
            mediaType: normalizedMediaType,
            initiatorId: fromUserId,
            participantIds: allParticipantIds,
            ringingTimeoutSec: config.ringingTimeoutSec,
            code: 'CALL_NOT_ALLOWED',
            message: denied,
          });
          emitCallError(fromUserId, roomId, denied, 'CALL_NOT_ALLOWED', callId);
          return;
        }

        const callerBusyCallId = await getBusyCallId(fromUserId);
        if (callerBusyCallId) {
          await safeBusyHistory({
            callId,
            roomId,
            roomType: normalizedRoomType,
            mediaType: normalizedMediaType,
            initiatorId: fromUserId,
            participantIds: allParticipantIds,
            busyUserIds: [fromUserId],
            ringingTimeoutSec: config.ringingTimeoutSec,
            reason: 'caller-busy',
          });
          io.to(fromUserId).emit('call/busy', {
            callId,
            roomId,
            userId: fromUserId,
            reason: 'caller-busy',
          });
          return;
        }

        const targetBusy = await Promise.all(
          targets.map(async (targetId) => ({
            targetId,
            callId: await getBusyCallId(targetId),
          }))
        );
        const busyTargets = targetBusy
          .filter((item) => item.callId)
          .map((item) => item.targetId);
        const availableTargets = targets.filter(
          (targetId) => !busyTargets.includes(targetId)
        );

        if (normalizedRoomType === 'private' && busyTargets.length) {
          await safeBusyHistory({
            callId,
            roomId,
            roomType: normalizedRoomType,
            mediaType: normalizedMediaType,
            initiatorId: fromUserId,
            participantIds: allParticipantIds,
            busyUserIds: busyTargets,
            ringingTimeoutSec: config.ringingTimeoutSec,
            reason: 'recipient-busy',
          });
          await emitCallLog({
            roomId,
            userId: fromUserId,
            text: `${mediaLabel(normalizedMediaType)} call busy`,
          }).catch(() => {});
          io.to(fromUserId).emit('call/busy', {
            callId,
            roomId,
            busyUserIds: busyTargets,
            reason: 'recipient-busy',
          });
          return;
        }

        if (!availableTargets.length) {
          await safeBusyHistory({
            callId,
            roomId,
            roomType: normalizedRoomType,
            mediaType: normalizedMediaType,
            initiatorId: fromUserId,
            participantIds: allParticipantIds,
            busyUserIds: busyTargets,
            ringingTimeoutSec: config.ringingTimeoutSec,
            reason: 'all-recipients-busy',
          });
          io.to(fromUserId).emit('call/busy', {
            callId,
            roomId,
            busyUserIds: busyTargets,
            reason: 'all-recipients-busy',
          });
          return;
        }

        const existingRoomCall = await getActiveCallByRoom(roomId);
        if (existingRoomCall) {
          const message = 'A call is already active in this room';
          await safeFailedHistory({
            callId,
            roomId,
            roomType: normalizedRoomType,
            mediaType: normalizedMediaType,
            initiatorId: fromUserId,
            participantIds: allParticipantIds,
            ringingTimeoutSec: config.ringingTimeoutSec,
            code: 'CALL_ALREADY_ACTIVE',
            message,
          });
          emitCallError(
            fromUserId,
            roomId,
            message,
            'CALL_ALREADY_ACTIVE',
            callId
          );
          return;
        }

        const now = Date.now();
        const state = {
          callId,
          roomId,
          roomType: normalizedRoomType,
          mediaType: normalizedMediaType,
          initiatorId: fromUserId,
          fromName,
          fromUsername,
          recipientsId: availableTargets,
          participantIds: unique([fromUserId, ...availableTargets]),
          busyUserIds: unique([fromUserId, ...availableTargets]),
          rejectedUserIds: [],
          joinedUserIds: [fromUserId],
          ringingAt: now,
          acceptedAt: null,
          startedAt: null,
          connectedLogged: false,
          ringingTimeoutSec: Math.max(
            10,
            Number(config.ringingTimeoutSec || 45)
          ),
        };

        const reservation = await reserveActiveCall(state);
        if (!reservation.reserved) {
          if (reservation.reason === 'user-busy') {
            await safeBusyHistory({
              callId,
              roomId,
              roomType: normalizedRoomType,
              mediaType: normalizedMediaType,
              initiatorId: fromUserId,
              participantIds: allParticipantIds,
              busyUserIds: reservation.busyUserId
                ? [reservation.busyUserId]
                : [],
              ringingTimeoutSec: config.ringingTimeoutSec,
              reason: 'reservation-busy',
            });
            io.to(fromUserId).emit('call/busy', {
              callId,
              roomId,
              busyUserIds: reservation.busyUserId
                ? [reservation.busyUserId]
                : [],
              reason: 'reservation-busy',
            });
          } else {
            const message = 'A call is already active in this room';
            await safeFailedHistory({
              callId,
              roomId,
              roomType: normalizedRoomType,
              mediaType: normalizedMediaType,
              initiatorId: fromUserId,
              participantIds: allParticipantIds,
              ringingTimeoutSec: config.ringingTimeoutSec,
              code: 'CALL_ALREADY_ACTIVE',
              message,
            });
            emitCallError(
              fromUserId,
              roomId,
              message,
              'CALL_ALREADY_ACTIVE',
              callId
            );
          }
          return;
        }

        reservedState = reservation.state;
        await createCallHistory({
          callId,
          roomId,
          roomType: normalizedRoomType,
          mediaType: normalizedMediaType,
          initiatorId: fromUserId,
          participantIds: allParticipantIds,
          joinedUserIds: [fromUserId],
          busyUserIds: busyTargets,
          status: 'ringing',
          ringingTimeoutSec: state.ringingTimeoutSec,
          ringingAt: new Date(now),
          eventUserId: fromUserId,
          eventReason: 'outgoing-call-started',
        });
        historyCreated = true;

        socket.join(getCallRoom(roomId));
        socketCallById.set(socket.id, { callId, roomId });
        socketUserById.set(socket.id, fromUserId);
        startRingTimer(reservedState, state.ringingTimeoutSec * 1000);

        await emitCallLog({
          roomId,
          userId: fromUserId,
          text: `${mediaLabel(normalizedMediaType)} call started`,
        }).catch(() => {});

        io.to(fromUserId).emit('call/started', {
          callId,
          roomId,
          roomType: normalizedRoomType,
          mediaType: normalizedMediaType,
        });

        io.to(availableTargets).emit('call/incoming', {
          callId,
          roomId,
          roomType: normalizedRoomType,
          fromUserId,
          fromName,
          fromUsername,
          mediaType: normalizedMediaType,
          ringingTimeoutSec: state.ringingTimeoutSec,
        });

        if (busyTargets.length) {
          io.to(fromUserId).emit('call/busy-participants', {
            callId,
            roomId,
            busyUserIds: busyTargets,
          });
        }
      } catch (error0) {
        if (reservedState) await releaseCall(reservedState).catch(() => {});
        if (!historyCreated) {
          await safeFailedHistory({
            callId,
            roomId,
            roomType: normalizedRoomType,
            mediaType: normalizedMediaType,
            initiatorId: fromUserId,
            participantIds: unique([fromUserId, ...targets]),
            ringingTimeoutSec: config?.ringingTimeoutSec || 45,
            code: error0.code || 'CALL_START_FAILED',
            message: error0.message || 'Unable to start call',
          });
        } else {
          await recordCallEvent({
            callId,
            eventStatus: 'failed',
            userId: fromUserId,
            reason: 'start-failed',
            code: error0.code || 'CALL_START_FAILED',
            message: error0.message || 'Unable to start call',
            patch: {
              endedAt: new Date(),
              endedBy: fromUserId,
              endReason: 'failed',
              failureCode: error0.code || 'CALL_START_FAILED',
              failureMessage: error0.message || 'Unable to start call',
            },
          }).catch(() => {});
        }
        emitCallError(
          fromUserId,
          roomId,
          error0.message || 'Unable to start call',
          error0.code || 'CALL_START_FAILED',
          callId
        );
      }
    }
  );

  socket.on('call/join', async ({ callId, roomId, userId, mediaType }) => {
    if ((!callId && !roomId) || !userId) return;

    try {
      const state = await resolveCallState({ callId, roomId });
      if (!state) {
        // The caller can emit join immediately after call/start while the async
        // policy/history/Redis setup is still completing. call/start joins the
        // caller socket itself after reservation, so this race is intentionally silent.
        return;
      }

      const callRoom = getCallRoom(state.roomId);
      socket.join(callRoom);
      socketCallById.set(socket.id, {
        callId: state.callId,
        roomId: state.roomId,
      });
      socketUserById.set(socket.id, userId);

      if (!state.participantIds.includes(userId)) {
        emitCallError(
          userId,
          state.roomId,
          'You are not a participant in this call',
          'CALL_PARTICIPANT_REQUIRED',
          state.callId
        );
        socket.leave(callRoom);
        return;
      }

      if (!state.joinedUserIds.includes(userId)) state.joinedUserIds.push(userId);

      const isRecipient = userId !== state.initiatorId;
      if (isRecipient && !state.startedAt) {
        clearRingTimer(state.callId);
        const now = Date.now();
        if (!state.acceptedAt) {
          state.acceptedAt = now;
          await recordCallEvent({
            callId: state.callId,
            eventStatus: 'accepted',
            userId,
            reason: 'recipient-accepted',
            patch: {
              acceptedAt: new Date(now),
              joinedUserIds: unique(state.joinedUserIds),
            },
          }).catch(() => {});
        }
        state.startedAt = now;
        await recordCallEvent({
          callId: state.callId,
          eventStatus: 'connected',
          userId,
          reason: 'media-session-started',
          patch: {
            acceptedAt: new Date(state.acceptedAt || now),
            connectedAt: new Date(now),
            joinedUserIds: unique(state.joinedUserIds),
          },
        }).catch(() => {});

        io.to(state.initiatorId).emit('call/accepted', {
          callId: state.callId,
          roomId: state.roomId,
          userId,
        });
        io.to(callRoom).emit('call/connected', {
          callId: state.callId,
          roomId: state.roomId,
          acceptedBy: userId,
        });

        if (!state.connectedLogged) {
          state.connectedLogged = true;
          await emitCallLog({
            roomId: state.roomId,
            userId,
            text: `${mediaLabel(state.mediaType)} call connected`,
          }).catch(() => {});
        }
      }

      await saveActiveCall(state);
      socket.to(callRoom).emit('call/user-joined', {
        callId: state.callId,
        roomId: state.roomId,
        userId,
        mediaType: mediaType === 'video' ? 'video' : 'audio',
      });
    } catch (error0) {
      emitCallError(
        userId,
        roomId,
        error0.message || 'Unable to join call',
        error0.code || 'CALL_JOIN_FAILED',
        callId
      );
    }
  });

  socket.on('call/accept', async ({ callId, roomId, userId }) => {
    if ((!callId && !roomId) || !userId) return;
    try {
      const state = await resolveCallState({ callId, roomId });
      if (!state || !state.participantIds.includes(userId)) return;
      clearRingTimer(state.callId);
      if (!state.acceptedAt) {
        const now = Date.now();
        state.acceptedAt = now;
        await recordCallEvent({
          callId: state.callId,
          eventStatus: 'accepted',
          userId,
          reason: 'recipient-accepted',
          patch: { acceptedAt: new Date(now) },
        }).catch(() => {});
        await saveActiveCall(state);
      }
      io.to(state.initiatorId).emit('call/accepted', {
        callId: state.callId,
        roomId: state.roomId,
        userId,
      });
    } catch (error0) {
      emitCallError(
        userId,
        roomId,
        error0.message || 'Unable to accept call',
        error0.code || 'CALL_ACCEPT_FAILED',
        callId
      );
    }
  });

  socket.on('call/leave', async ({ callId, roomId, userId }) => {
    if ((!callId && !roomId) || !userId) return;
    try {
      const state = await resolveCallState({ callId, roomId });
      const resolvedRoomId = state?.roomId || roomId;
      if (!resolvedRoomId) return;
      const callRoom = getCallRoom(resolvedRoomId);
      socket.leave(callRoom);
      socketCallById.delete(socket.id);
      socket.to(callRoom).emit('call/user-left', {
        callId: state?.callId || callId || null,
        roomId: resolvedRoomId,
        userId,
      });
    } catch (error0) {
      logger.error('CALL_LEAVE_ERROR', { message: error0.message });
    }
  });

  socket.on(
    'call/cancel',
    async ({ callId, roomId, userId, reason = 'cancelled' }) => {
      if ((!callId && !roomId) || !userId) return;
      try {
        const state = await resolveCallState({ callId, roomId });
        if (!state || state.initiatorId !== userId) return;

        const timedOut = reason === 'timeout';
        await recordCallEvent({
          callId: state.callId,
          eventStatus: timedOut ? 'missed' : 'ended',
          userId,
          reason,
          patch: {
            endedAt: new Date(),
            endedBy: userId,
            endReason: reason,
            durationSec: 0,
          },
        }).catch(() => {});

        await emitCallLog({
          roomId: state.roomId,
          userId,
          text: timedOut
            ? `No answer for ${mediaLabel(state.mediaType).toLowerCase()} call`
            : `${mediaLabel(state.mediaType)} call cancelled`,
        }).catch(() => {});

        const event = timedOut ? 'call/missed' : 'call/cancelled';
        const payload = {
          callId: state.callId,
          roomId: state.roomId,
          userId,
          reason,
        };
        io.to(state.recipientsId).emit(event, payload);
        io.to(getCallRoom(state.roomId)).emit(event, payload);
        await releaseCall(state);
      } catch (error0) {
        emitCallError(
          userId,
          roomId,
          error0.message || 'Unable to cancel call',
          error0.code || 'CALL_CANCEL_FAILED',
          callId
        );
      }
    }
  );

  socket.on(
    'call/end',
    async ({ callId, roomId, userId, reason = 'ended' }) => {
      if ((!callId && !roomId) || !userId) return;

      try {
        const state = await resolveCallState({ callId, roomId });
        const resolvedRoomId = state?.roomId || roomId;
        if (!resolvedRoomId) return;
        const callRoom = getCallRoom(resolvedRoomId);

        if (state) {
          const hasStarted = Number.isFinite(state.startedAt);
          const durationMs = hasStarted ? Date.now() - state.startedAt : 0;
          const durationSec = Math.max(0, Math.floor(durationMs / 1000));
          const duration = hasStarted ? formatCallDuration(durationMs) : '0 sec';

          await recordCallEvent({
            callId: state.callId,
            eventStatus: 'ended',
            userId,
            reason,
            patch: {
              endedAt: new Date(),
              endedBy: userId,
              endReason: reason,
              durationSec,
              joinedUserIds: unique(state.joinedUserIds),
              rejectedUserIds: unique(state.rejectedUserIds),
            },
          }).catch(() => {});

          await emitCallLog({
            roomId: state.roomId,
            userId,
            text: hasStarted
              ? `${mediaLabel(state.mediaType)} call ended (${duration})`
              : `${mediaLabel(state.mediaType)} call ended`,
          }).catch(() => {});
          await releaseCall(state);
        }

        socketCallById.delete(socket.id);
        io.to(callRoom).emit('call/ended', {
          callId: state?.callId || callId || null,
          roomId: resolvedRoomId,
          userId,
          reason,
        });
      } catch (error0) {
        emitCallError(
          userId,
          roomId,
          error0.message || 'Unable to end call',
          error0.code || 'CALL_END_FAILED',
          callId
        );
      }
    }
  );

  socket.on(
    'call/reject',
    async ({ callId, roomId, fromUserId }) => {
      if ((!callId && !roomId) || !fromUserId) return;

      try {
        const state = await resolveCallState({ callId, roomId });
        if (!state || !state.participantIds.includes(fromUserId)) return;
        if (fromUserId === state.initiatorId) return;

        if (!state.rejectedUserIds.includes(fromUserId)) {
          state.rejectedUserIds.push(fromUserId);
        }
        state.busyUserIds = unique(state.busyUserIds).filter(
          (id) => id !== fromUserId
        );
        await releaseUserBusy(fromUserId, state.callId);

        await emitCallLog({
          roomId: state.roomId,
          userId: fromUserId,
          text: `Rejected ${mediaLabel(state.mediaType)} call`,
        }).catch(() => {});

        io.to(state.initiatorId).emit('call/rejected', {
          callId: state.callId,
          roomId: state.roomId,
          fromUserId,
          toUserId: state.initiatorId,
        });

        const remaining = state.recipientsId.filter(
          (id) => !state.rejectedUserIds.includes(id)
        );
        const finalReject = state.roomType === 'private' || remaining.length === 0;

        await recordCallEvent({
          callId: state.callId,
          eventStatus: 'rejected',
          setStatus: finalReject,
          userId: fromUserId,
          reason: finalReject ? 'call-rejected' : 'participant-rejected',
          patch: {
            rejectedUserIds: unique(state.rejectedUserIds),
            ...(finalReject
              ? {
                  endedAt: new Date(),
                  endedBy: fromUserId,
                  endReason: 'rejected',
                  durationSec: 0,
                }
              : {}),
          },
        }).catch(() => {});

        if (finalReject) {
          await releaseCall(state);
          io.to(getCallRoom(state.roomId)).emit('call/ended', {
            callId: state.callId,
            roomId: state.roomId,
            userId: fromUserId,
            reason: 'rejected',
          });
        } else {
          await saveActiveCall(state);
        }
      } catch (error0) {
        emitCallError(
          fromUserId,
          roomId,
          error0.message || 'Unable to reject call',
          error0.code || 'CALL_REJECT_FAILED',
          callId
        );
      }
    }
  );

  socket.on(
    'call/signal',
    async ({ callId, roomId, fromUserId, toUserId, signal }) => {
      if ((!callId && !roomId) || !fromUserId || !toUserId || !signal) return;
      try {
        const state = await resolveCallState({ callId, roomId });
        if (!state) return;
        const socketUserId = socketUserById.get(socket.id);
        if (socketUserId && socketUserId !== fromUserId) return;
        if (
          !state.participantIds.includes(fromUserId) ||
          !state.participantIds.includes(toUserId) ||
          state.rejectedUserIds.includes(fromUserId) ||
          state.rejectedUserIds.includes(toUserId)
        ) {
          return;
        }

        await saveActiveCall(state);
        io.to(toUserId).emit('call/signal', {
          callId: state.callId,
          roomId: state.roomId,
          fromUserId,
          signal,
        });
      } catch (error0) {
        emitCallError(
          fromUserId,
          roomId,
          error0.message || 'Unable to relay call signal',
          error0.code || 'CALL_SIGNAL_FAILED',
          callId
        );
      }
    }
  );

  socket.on('disconnect', () => {
    const call = socketCallById.get(socket.id);
    const userId = socketUserById.get(socket.id);

    if (call?.roomId && userId) {
      io.to(getCallRoom(call.roomId)).emit('call/user-left', {
        callId: call.callId || null,
        roomId: call.roomId,
        userId,
        reason: 'socket-disconnected',
      });
    }

    socketCallById.delete(socket.id);
    socketUserById.delete(socket.id);
  });
};
