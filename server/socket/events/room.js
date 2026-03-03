const { io } = global;
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const ProfileModel = require('../../db/models/profile');
const { asArray, toPlain } = require('../../db/utils');
const Inbox = require('../../helpers/models/inbox');

const activeCalls = new Map();
const socketCallRoomById = new Map();
const socketUserById = new Map();

const formatCallDuration = (ms) => {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min > 0) return `${min} min ${sec} sec`;
  return `${sec} sec`;
};

const mediaLabel = (mediaType) => (mediaType === 'video' ? 'Video' : 'Voice');

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

module.exports = (socket) => {
  const getCallRoom = (roomId) => `call:${roomId}`;

  // join room
  socket.on('room/open', (args) => {
    if (args.prevRoom) {
      socket.leave(args.prevRoom);
    }

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
      activeCalls.set(roomId, {
        roomId,
        roomType: roomType || 'private',
        mediaType: mediaType || 'audio',
        initiatorId: fromUserId,
        fromName,
        fromUsername,
        recipientsId: asArray(recipientsId),
        ringingAt: Date.now(),
        startedAt: null,
        connectedLogged: false,
      });

      await emitCallLog({
        roomId,
        userId: fromUserId,
        text: `${mediaLabel(mediaType)} call started`,
      });

      const explicitTargets = asArray(recipientsId).filter(
        (ownerId) => ownerId !== fromUserId
      );
      let targets = explicitTargets;
      if (targets.length === 0) {
        const inboxDoc = await InboxModel.findOne({ where: { roomId } });
        const inboxPlain = toPlain(inboxDoc);
        const inboxOwners = asArray(inboxPlain?.ownersId);
        targets = inboxOwners.filter((ownerId) => ownerId !== fromUserId);
      }

      io.to(targets).emit('call/incoming', {
        roomId,
        roomType: targets.length > 1 ? 'group' : roomType || 'private',
        fromUserId,
        fromName,
        fromUsername,
        mediaType: mediaType || 'audio',
      });
    }
  );

  socket.on('call/join', async ({ roomId, userId, mediaType }) => {
    if (!roomId || !userId) return;
    const callRoom = getCallRoom(roomId);
    socket.join(callRoom);
    socketCallRoomById.set(socket.id, roomId);
    socketUserById.set(socket.id, userId);

    const callState = activeCalls.get(roomId);
    if (callState && !callState.startedAt && userId !== callState.initiatorId) {
      callState.startedAt = Date.now();
      activeCalls.set(roomId, callState);
    }
    if (callState && !callState.connectedLogged) {
      callState.connectedLogged = true;
      activeCalls.set(roomId, callState);
      await emitCallLog({
        roomId,
        userId: userId || callState.initiatorId,
        text: `${mediaLabel(callState.mediaType)} call connected`,
      });
      io.to(callRoom).emit('call/connected', { roomId });
    }

    socket.to(callRoom).emit('call/user-joined', {
      roomId,
      userId,
      mediaType: mediaType || 'audio',
    });
  });

  socket.on('call/leave', ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    const callRoom = getCallRoom(roomId);
    socket.leave(callRoom);
    socketCallRoomById.delete(socket.id);
    socket.to(callRoom).emit('call/user-left', { roomId, userId });
  });

  socket.on('call/end', async ({ roomId, userId }) => {
    if (!roomId || !userId) return;
    const callRoom = getCallRoom(roomId);
    const callState = activeCalls.get(roomId);
    if (callState) {
      const hasStarted = Number.isFinite(callState.startedAt);
      const duration = hasStarted
        ? formatCallDuration(Date.now() - callState.startedAt)
        : '0 sec';
      await emitCallLog({
        roomId,
        userId,
        text: hasStarted
          ? `${mediaLabel(callState.mediaType)} call ended (${duration})`
          : `${mediaLabel(callState.mediaType)} call ended`,
      });
      activeCalls.delete(roomId);
    }

    socketCallRoomById.delete(socket.id);
    io.to(callRoom).emit('call/ended', { roomId, userId });
  });

  socket.on('call/reject', async ({ roomId, fromUserId, toUserId }) => {
    if (!roomId || !fromUserId || !toUserId) return;
    const callState = activeCalls.get(roomId);
    await emitCallLog({
      roomId,
      userId: fromUserId,
      text: `Rejected ${mediaLabel(callState?.mediaType || 'audio')} call`,
    });
    activeCalls.delete(roomId);

    io.to(toUserId).emit('call/rejected', {
      roomId,
      fromUserId,
      toUserId,
    });
  });

  socket.on('call/signal', ({ roomId, fromUserId, toUserId, signal }) => {
    if (!roomId || !fromUserId || !toUserId || !signal) return;
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
      });
    }
    socketCallRoomById.delete(socket.id);
    socketUserById.delete(socket.id);
  });
};
