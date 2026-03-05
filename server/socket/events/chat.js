const { io } = global;
const { Op } = require('sequelize');
const InboxModel = require('../../db/models/inbox');
const ChatModel = require('../../db/models/chat');
const FileModel = require('../../db/models/file');
const ProfileModel = require('../../db/models/profile');
const SettingModel = require('../../db/models/setting');
const GroupModel = require('../../db/models/group');
const {
  asArray,
  toPlain,
  toPlainMany,
  addToSet,
  pullFromArray,
} = require('../../db/utils');

const Inbox = require('../../helpers/models/inbox');
const uniqueId = require('../../helpers/uniqueId');
const logger = require('../../helpers/logger');
const {
  parseDataUri,
  saveBufferFile,
  deleteLocalFileByUrl,
} = require('../../helpers/storage');
const { canGroupMemberSendMessage } = require('../../helpers/groupPermissions');

const POLL_PREFIX = '__poll__::';
const EVENT_PREFIX = '__event__::';

const normalizePollVotes = (votes) =>
  asArray(votes)
    .map((vote) => ({
      userId: vote?.userId || '',
      fullname: vote?.fullname || '[unknown]',
    }))
    .filter((vote) => vote.userId);

const normalizePollPayload = (poll) => {
  const options = asArray(poll?.options)
    .map((option, index) => ({
      id: String(option?.id || `opt-${index + 1}`),
      text: String(option?.text || '').trim(),
      votes: normalizePollVotes(option?.votes),
    }))
    .filter((option) => option.text);

  if (!String(poll?.question || '').trim() || options.length < 2) {
    return null;
  }

  return {
    version: 1,
    question: String(poll.question).trim(),
    options,
    createdBy: poll?.createdBy || null,
    createdAt: poll?.createdAt || new Date().toISOString(),
  };
};

const parsePollFromText = (text) => {
  if (typeof text !== 'string' || !text.startsWith(POLL_PREFIX)) return null;
  try {
    return normalizePollPayload(JSON.parse(text.slice(POLL_PREFIX.length)));
  } catch (error0) {
    return null;
  }
};

const serializePollToText = (poll) => `${POLL_PREFIX}${JSON.stringify(poll)}`;

const parseEventFromText = (text) => {
  if (typeof text !== 'string' || !text.startsWith(EVENT_PREFIX)) return null;
  try {
    const parsed = JSON.parse(text.slice(EVENT_PREFIX.length));
    const title = String(parsed?.title || '').trim();
    const date = String(parsed?.date || '').trim();
    if (!title || !date) return null;
    return parsed;
  } catch (error0) {
    return null;
  }
};

const getInboxPreviewText = (chatText, file) => {
  const poll = parsePollFromText(chatText);
  if (poll) return 'Poll';
  const event = parseEventFromText(chatText);
  if (event) return 'Event';
  return chatText && chatText.length > 0
    ? chatText
    : toPlain(file)?.originalname || '';
};

const sanitizeFolderName = (value, fallback = 'unknown') => {
  const safe = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  return safe || fallback;
};

const resolvePrivateOwners = async ({ ownersId, roomId }) => {
  const providedOwners = asArray(ownersId).filter(Boolean);
  if (providedOwners.length >= 2) return providedOwners;
  if (!roomId) return providedOwners;

  const inbox = await InboxModel.findOne({
    where: { roomId },
    attributes: ['ownersId'],
  });

  return asArray(toPlain(inbox)?.ownersId);
};

const getPrivateChatBlockState = async ({ senderId, ownersId, roomId }) => {
  if (!senderId) return true;

  const roomOwners = await resolvePrivateOwners({ ownersId, roomId });
  if (!roomOwners.includes(senderId)) return true;

  const receiverId = roomOwners.find((ownerId) => ownerId !== senderId);
  if (!receiverId) return true;

  const [senderSetting, receiverSetting] = await Promise.all([
    SettingModel.findOne({
      where: { userId: senderId },
      attributes: ['blockedUserIds'],
    }),
    SettingModel.findOne({
      where: { userId: receiverId },
      attributes: ['blockedUserIds'],
    }),
  ]);

  const senderBlocked = asArray(toPlain(senderSetting)?.blockedUserIds);
  const receiverBlocked = asArray(toPlain(receiverSetting)?.blockedUserIds);

  return {
    receiverId,
    senderBlockedReceiver: senderBlocked.includes(receiverId),
    receiverBlockedSender: receiverBlocked.includes(senderId),
  };
};

const resolveArchivedByAfterIncoming = async ({
  archivedBy,
  ownersId,
  senderId,
}) => {
  const currentArchivedBy = asArray(archivedBy);
  if (currentArchivedBy.length === 0) return currentArchivedBy;

  const receivers = asArray(ownersId).filter((ownerId) => ownerId !== senderId);
  const archivedReceivers = currentArchivedBy.filter((userId) =>
    receivers.includes(userId)
  );
  if (archivedReceivers.length === 0) return currentArchivedBy;

  const settingsRaw = await SettingModel.findAll({
    where: { userId: { [Op.in]: archivedReceivers } },
    attributes: ['userId', 'keepArchived'],
  });
  const settings = toPlainMany(settingsRaw);
  const keepArchivedByUser = new Map(
    settings.map((item) => [item.userId, !!item.keepArchived])
  );

  const toUnarchive = archivedReceivers.filter(
    (userId) => !keepArchivedByUser.get(userId)
  );

  return pullFromArray(currentArchivedBy, toUnarchive);
};

const buildReplyPayload = async (replyTo) => {
  if (!replyTo) return null;
  const replyDoc = await ChatModel.findOne({
    where: { _id: replyTo },
    attributes: ['_id', 'userId', 'text', 'fileId'],
  });
  const reply = toPlain(replyDoc);
  if (!reply) return null;

  const [replyProfileDoc, replyFileDoc] = await Promise.all([
    ProfileModel.findOne({
      where: { userId: reply.userId },
      attributes: ['fullname'],
    }),
    reply.fileId
      ? FileModel.findOne({
          where: { fileId: reply.fileId },
          attributes: ['originalname'],
        })
      : null,
  ]);

  return {
    _id: reply._id,
    userId: reply.userId,
    fullname: toPlain(replyProfileDoc)?.fullname || '[inactive]',
    text: reply.text || toPlain(replyFileDoc)?.originalname || '',
  };
};

const canAccessGroupRoom = async ({ roomId, userId }) => {
  if (!roomId || !userId) {
    return { canAccess: false, canSend: false };
  }
  const groupDoc = await GroupModel.findOne({
    where: { roomId },
    attributes: ['participantsId', 'adminId', 'adminsId', 'permissions'],
  });
  if (!groupDoc) return { canAccess: false, canSend: false };
  const canAccess = asArray(toPlain(groupDoc)?.participantsId).includes(userId);
  return {
    canAccess,
    canSend:
      canAccess && canGroupMemberSendMessage({ group: groupDoc, userId }),
  };
};

module.exports = (socket) => {
  socket.on('chat/insert', async (args) => {
    try {
      logger.info('CHAT_INSERT_START', {
        socketId: socket.id,
        roomId: args?.roomId,
        roomType: args?.roomType,
        userId: args?.userId,
        hasText: !!args?.text,
        hasFile: !!args?.file,
        file: args?.file
          ? {
              originalname: args.file.originalname,
              type: args.file.type,
              size: args.file.size,
              urlPrefix:
                typeof args.file.url === 'string'
                  ? args.file.url.slice(0, 60)
                  : null,
            }
          : null,
      });

      let hiddenOwners = [];
      let visibleOwners = asArray(args.ownersId);
      let receiverOnline = false;

      if (args.roomType === 'group') {
        const groupAccess = await canAccessGroupRoom({
          roomId: args.roomId,
          userId: args.userId,
        });
        if (!groupAccess.canAccess || !groupAccess.canSend) return;
      }

      if (args.roomType === 'private') {
        const blockState = await getPrivateChatBlockState({
          senderId: args.userId,
          ownersId: args.ownersId,
          roomId: args.roomId,
        });

        if (blockState === true) return;

        const { receiverId, senderBlockedReceiver, receiverBlockedSender } =
          blockState;
        if (senderBlockedReceiver || receiverBlockedSender) return;

        hiddenOwners = [];
        visibleOwners = visibleOwners.filter((ownerId) => ownerId !== receiverId);
        visibleOwners = addToSet(visibleOwners, [receiverId]);

        const receiverProfile = await ProfileModel.findOne({
          where: { userId: receiverId },
          attributes: ['online'],
        });
        receiverOnline = !!toPlain(receiverProfile)?.online;
      }

      let fileId = null;
      let file = null;

      if (args.file) {
        const originalname = args.file.originalname || 'attachment';
        const arrOriname = originalname.split('.');
        const format =
          arrOriname.length === 1
            ? 'bin'
            : arrOriname.reverse()[0].toLowerCase();

        fileId = uniqueId(20);

        if (
          typeof args.file.url === 'string' &&
          args.file.url.startsWith('data:')
        ) {
          logger.info('CHAT_INSERT_FILE_DATA_URI', {
            userId: args.userId,
            roomId: args.roomId,
            originalname,
          });
          const { mime, buffer } = parseDataUri(args.file.url);
          const senderProfile = await ProfileModel.findOne({
            where: { userId: args.userId },
            attributes: ['username'],
          });
          const safeUserFolder = sanitizeFolderName(
            toPlain(senderProfile)?.username,
            sanitizeFolderName(args.userId, 'unknown')
          );

          const upload = await saveBufferFile({
            buffer,
            folder: `chat/${safeUserFolder || 'unknown'}`,
            filename: `${fileId}.${format}`,
          });
          logger.info('CHAT_INSERT_FILE_SAVED', {
            userId: args.userId,
            roomId: args.roomId,
            fileId,
            uploadPath: upload.publicPath,
            uploadSize: upload.size,
          });

          let type = 'raw';
          if (mime.startsWith('image/')) type = 'image';
          if (mime.startsWith('video/')) type = 'video';

          file = await FileModel.create({
            fileId,
            url: upload.url,
            originalname,
            type,
            format,
            size: upload.size,
          });
        } else {
          logger.info('CHAT_INSERT_FILE_URL', {
            userId: args.userId,
            roomId: args.roomId,
            fileId,
            url: args.file.url,
          });
          file = await FileModel.create({
            fileId,
            url: args.file.url,
            originalname,
            type: args.file.type || 'raw',
            format: args.file.format || format,
            size: Number(args.file.size || 0),
          });
        }
      }

      const chatDoc = await ChatModel.create({
        ...args,
        fileId,
        deletedBy: hiddenOwners,
        delivered: args.roomType === 'private' ? receiverOnline : false,
      });
      const chat = toPlain(chatDoc);

      const profileDoc = await ProfileModel.findOne({
        where: { userId: args.userId },
        attributes: ['userId', 'avatar', 'fullname'],
      });
      const profile = toPlain(profileDoc);

      const currentInbox = await InboxModel.findOne({
        where: { roomId: args.roomId },
      });
      const contentText = getInboxPreviewText(chat.text, file);

      const nextDeletedBy =
        hiddenOwners.length > 0
          ? addToSet(currentInbox?.deletedBy, hiddenOwners)
          : [];

      if (currentInbox) {
        const nextArchivedBy = await resolveArchivedByAfterIncoming({
          archivedBy: currentInbox.archivedBy,
          ownersId: args.ownersId,
          senderId: args.userId,
        });

        await currentInbox.update({
          unreadMessage: Number(currentInbox.unreadMessage || 0) + 1,
          roomId: args.roomId,
          ownersId: args.ownersId,
          fileId,
          deletedBy: nextDeletedBy,
          archivedBy: nextArchivedBy,
          content: {
            from: args.userId,
            senderName: profile?.fullname || '',
            text: contentText,
            time: chat.createdAt,
            delivered: !!chat.delivered,
            readed: false,
          },
        });
      } else {
        await InboxModel.create({
          roomId: args.roomId,
          ownersId: args.ownersId,
          unreadMessage: 1,
          fileId,
          deletedBy: nextDeletedBy,
          content: {
            from: args.userId,
            senderName: profile?.fullname || '',
            text: contentText,
            time: chat.createdAt,
            delivered: !!chat.delivered,
            readed: false,
          },
        });
      }

      const inboxes = await Inbox.find({ roomId: args.roomId });

      io.to(args.roomId).emit('chat/insert', {
        ...chat,
        profile,
        file: toPlain(file),
        reply: await buildReplyPayload(chat.replyTo),
        poll: parsePollFromText(chat.text),
      });

      logger.info('CHAT_INSERT_DONE', {
        roomId: args.roomId,
        chatId: chat._id,
        fileId,
        visibleOwnersCount: visibleOwners.length,
      });
      if (inboxes[0]) {
        io.to(visibleOwners).emit('inbox/find', inboxes[0]);
      }
    } catch (error0) {
      logger.error('CHAT_INSERT_ERROR', {
        socketId: socket.id,
        message: error0.message,
        stack: error0.stack,
        roomId: args?.roomId,
        userId: args?.userId,
      });
    }
  });

  socket.on('chat/read', async (args) => {
    try {
      const inbox = await InboxModel.findOne({
        where: { roomId: args.roomId },
      });
      if (inbox) {
        const content = toPlain(inbox)?.content || {};
        const isReaderReceiver = content.from && content.from !== args.userId;
        await inbox.update({
          unreadMessage: 0,
          markUnreadBy: pullFromArray(inbox.markUnreadBy, [args.userId]),
          content: {
            ...content,
            delivered: isReaderReceiver ? true : !!content.delivered,
            readed: isReaderReceiver ? true : !!content.readed,
          },
        });
      }

      const chats = await ChatModel.findAll({
        where: { roomId: args.roomId, readed: false },
      });
      await Promise.all(
        chats.map((chat) => chat.update({ readed: true, delivered: true }))
      );

      const inboxes = await Inbox.find({ ownersId: { $all: args.ownersId } });

      io.to(args.ownersId).emit('inbox/read', inboxes[0]);
      io.to(args.roomId).emit('chat/read', true);
    } catch (error0) {
      console.log(error0.message);
    }
  });

  let typingEnds = null;
  socket.on('chat/typing', async ({ roomId, roomType, userId }) => {
    clearTimeout(typingEnds);

    if (roomType === 'private') {
      const blockState = await getPrivateChatBlockState({
        senderId: userId,
        roomId,
      });
      if (blockState === true) return;
      if (
        blockState.senderBlockedReceiver ||
        blockState.receiverBlockedSender
      ) {
        return;
      }
    }

    if (roomType === 'group') {
      const groupAccess = await canAccessGroupRoom({ roomId, userId });
      if (!groupAccess.canAccess || !groupAccess.canSend) return;
    }

    const isGroup = roomType === 'group';
    const typer = isGroup
      ? await ProfileModel.findOne({
          where: { userId },
          attributes: ['fullname'],
        })
      : null;

    socket.broadcast
      .to(roomId)
      .emit(
        'chat/typing',
        isGroup ? `${typer.fullname} typing...` : 'typing...'
      );

    typingEnds = setTimeout(() => {
      socket.broadcast.to(roomId).emit('chat/typing-ends', true);
    }, 1000);
  });

  socket.on(
    'chat/delete',
    async ({ userId, chatsId, roomId, deleteForEveryone }) => {
      try {
        const handleDeleteFiles = async (chats) => {
          const filesId = chats
            .filter((elem) => !!elem.fileId)
            .map((elem) => elem.fileId);

          if (filesId.length > 0) {
            const files = await FileModel.findAll({
              where: { fileId: { [Op.in]: filesId } },
              attributes: ['url', 'fileId'],
            });

            await Promise.all(
              files.map((file) => deleteLocalFileByUrl(file.url))
            );
            await FileModel.destroy({
              where: { fileId: { [Op.in]: filesId } },
            });
          }
        };

        const targetChatsRaw = await ChatModel.findAll({
          where: { roomId, _id: { [Op.in]: chatsId } },
        });
        const targetChats = toPlainMany(targetChatsRaw);
        const ownChatIds = targetChats
          .filter((chat) => chat.userId === userId)
          .map((chat) => chat._id);
        const othersChatIds = targetChats
          .filter((chat) => chat.userId !== userId)
          .map((chat) => chat._id);

        if (deleteForEveryone) {
          // Owner messages can be deleted for everyone.
          if (ownChatIds.length > 0) {
            const ownChats = targetChats.filter((chat) =>
              ownChatIds.includes(chat._id)
            );
            await handleDeleteFiles(ownChats);
            await ChatModel.destroy({
              where: { roomId, _id: { [Op.in]: ownChatIds } },
            });
            io.to(roomId).emit('chat/delete', { userId, chatsId: ownChatIds });
          }

          // Non-owner messages are always delete-for-me only.
          if (othersChatIds.length > 0) {
            await Promise.all(
              targetChatsRaw
                .filter((chat) => othersChatIds.includes(chat._id))
                .map(async (chat) => {
                  const deletedBy = addToSet(chat.deletedBy, [userId]);
                  await chat.update({ deletedBy });
                })
            );
            socket.emit('chat/delete', { userId, chatsId: othersChatIds });
          }
        } else {
          await Promise.all(
            targetChatsRaw.map(async (chat) => {
              const deletedBy = addToSet(chat.deletedBy, [userId]);
              await chat.update({ deletedBy });
            })
          );

          const inbox = await InboxModel.findOne({ where: { roomId } });
          const ownersCount = asArray(toPlain(inbox)?.ownersId).length;

          const roomChats = toPlainMany(
            await ChatModel.findAll({
              where: { roomId },
            })
          );
          const permanentlyDeleted = roomChats.filter(
            (chat) => asArray(chat.deletedBy).length >= ownersCount
          );

          await handleDeleteFiles(permanentlyDeleted);
          if (permanentlyDeleted.length > 0) {
            await ChatModel.destroy({
              where: {
                _id: { [Op.in]: permanentlyDeleted.map((chat) => chat._id) },
              },
            });
          }

          socket.emit('chat/delete', { userId, chatsId });
        }
      } catch (error0) {
        console.error(error0.message);
      }
    }
  );

  socket.on('chat/react', async ({ roomId, chatId, userId, emoji }) => {
    try {
      if (!roomId || !chatId || !userId) return;
      const chatDoc = await ChatModel.findOne({
        where: { _id: chatId, roomId },
      });
      if (!chatDoc) return;

      const nextReactions = { ...(toPlain(chatDoc)?.reactions || {}) };
      if (!emoji) {
        delete nextReactions[userId];
      } else {
        nextReactions[userId] = emoji;
      }

      await chatDoc.update({ reactions: nextReactions });
      io.to(roomId).emit('chat/react', { chatId, reactions: nextReactions });

      // Show reaction as a regular chat entry as well.
      if (!emoji) return;

      const currentInbox = await InboxModel.findOne({
        where: { roomId },
      });
      if (!currentInbox) return;

      const ownersId = asArray(currentInbox.ownersId);
      let hiddenOwners = [];
      let visibleOwners = ownersId;
      let receiverOnline = false;

      if (ownersId.length === 2) {
        const blockState = await getPrivateChatBlockState({
          senderId: userId,
          ownersId,
          roomId,
        });
        if (blockState === true) return;

        const { receiverId, senderBlockedReceiver, receiverBlockedSender } =
          blockState;
        if (senderBlockedReceiver || receiverBlockedSender) return;

        hiddenOwners = [];
        visibleOwners = visibleOwners.filter((ownerId) => ownerId !== receiverId);
        visibleOwners = addToSet(visibleOwners, [receiverId]);

        const receiverProfile = await ProfileModel.findOne({
          where: { userId: receiverId },
          attributes: ['online'],
        });
        receiverOnline = !!toPlain(receiverProfile)?.online;
      }

      const reactionChatDoc = await ChatModel.create({
        userId,
        roomId,
        text: `Reacted ${emoji}`,
        replyTo: chatId,
        readed: false,
        delivered: ownersId.length === 2 ? receiverOnline : false,
        deletedBy: hiddenOwners,
        fileId: null,
        reactions: {},
      });
      const reactionChat = toPlain(reactionChatDoc);

      const profile = toPlain(
        await ProfileModel.findOne({
          where: { userId },
          attributes: ['userId', 'avatar', 'fullname'],
        })
      );

      const nextDeletedBy =
        hiddenOwners.length > 0
          ? addToSet(currentInbox.deletedBy, hiddenOwners)
          : [];

      await currentInbox.update({
        unreadMessage: Number(currentInbox.unreadMessage || 0) + 1,
        deletedBy: nextDeletedBy,
        archivedBy: await resolveArchivedByAfterIncoming({
          archivedBy: currentInbox.archivedBy,
          ownersId,
          senderId: userId,
        }),
        content: {
          from: userId,
          senderName: profile?.fullname || '',
          text: reactionChat.text,
          time: reactionChat.createdAt,
          delivered: !!reactionChat.delivered,
          readed: false,
        },
      });

      io.to(roomId).emit('chat/insert', {
        ...reactionChat,
        profile,
        file: null,
        reply: await buildReplyPayload(reactionChat.replyTo),
        poll: null,
      });

      const inboxes = await Inbox.find({ roomId });
      if (inboxes[0]) {
        io.to(visibleOwners).emit('inbox/find', inboxes[0]);
      }
    } catch (error0) {
      console.error(error0.message);
    }
  });

  socket.on('chat/poll-vote', async ({ roomId, chatId, userId, optionId }) => {
    try {
      if (!roomId || !chatId || !userId || !optionId) return;

      const chatDoc = await ChatModel.findOne({
        where: { _id: chatId, roomId },
      });
      if (!chatDoc) return;

      const poll = parsePollFromText(chatDoc.text);
      if (!poll) return;

      const voterProfile = toPlain(
        await ProfileModel.findOne({
          where: { userId },
          attributes: ['fullname'],
        })
      );
      const voterName = voterProfile?.fullname || '[unknown]';

      let alreadySelectedOptionId = null;
      const cleanedOptions = poll.options.map((option) => {
        const hasVote = option.votes.some((vote) => vote.userId === userId);
        if (hasVote) alreadySelectedOptionId = option.id;
        return {
          ...option,
          votes: option.votes.filter((vote) => vote.userId !== userId),
        };
      });

      const shouldAddVote = alreadySelectedOptionId !== optionId;
      const nextOptions = cleanedOptions.map((option) => {
        if (option.id !== optionId || !shouldAddVote) return option;
        return {
          ...option,
          votes: [...option.votes, { userId, fullname: voterName }],
        };
      });

      const nextPoll = normalizePollPayload({
        ...poll,
        options: nextOptions,
      });
      if (!nextPoll) return;

      const nextText = serializePollToText(nextPoll);
      await chatDoc.update({ text: nextText });

      io.to(roomId).emit('chat/poll-vote', {
        chatId,
        text: nextText,
        poll: nextPoll,
      });
    } catch (error0) {
      logger.error('CHAT_POLL_VOTE_ERROR', {
        message: error0.message,
        stack: error0.stack,
        roomId,
        chatId,
        userId,
      });
    }
  });

  socket.on(
    'chat/forward',
    async ({
      userId,
      fromRoomId,
      chatsId,
      toRoomId,
      toRoomType,
      toOwnersId,
    }) => {
      try {
        if (!userId || !fromRoomId || !toRoomId) return;
        const ids = asArray(chatsId);
        if (ids.length === 0) return;

        let visibleOwners = asArray(toOwnersId);
        if (toRoomType === 'private') {
          const blockState = await getPrivateChatBlockState({
            senderId: userId,
            ownersId: toOwnersId,
            roomId: toRoomId,
          });
          if (blockState === true) return;
          if (blockState.senderBlockedReceiver || blockState.receiverBlockedSender) {
            return;
          }
        }

        if (toRoomType === 'group') {
          const groupAccess = await canAccessGroupRoom({
            roomId: toRoomId,
            userId,
          });
          if (!groupAccess.canAccess || !groupAccess.canSend) return;
        }

        const fromChats = toPlainMany(
          await ChatModel.findAll({
            where: { roomId: fromRoomId, _id: { [Op.in]: ids } },
            order: [['createdAt', 'ASC']],
          })
        );
        if (fromChats.length === 0) return;

        const profile = toPlain(
          await ProfileModel.findOne({
            where: { userId },
            attributes: ['userId', 'avatar', 'fullname'],
          })
        );

        const forwardTexts = fromChats.map((source) =>
          source.text
            ? (() => {
                const poll = parsePollFromText(source.text);
                if (poll) return `Forwarded poll: ${poll.question}`;
                return `Forwarded:\n${source.text}`;
              })()
            : 'Forwarded attachment'
        );
        const createdMessages = await Promise.all(
          forwardTexts.map((text) =>
            ChatModel.create({
              userId,
              roomId: toRoomId,
              text,
              replyTo: null,
              readed: false,
              delivered: false,
              deletedBy: [],
              fileId: null,
              reactions: {},
            })
          )
        );
        const createdPlain = toPlainMany(createdMessages);

        const lastMessage = createdPlain[createdPlain.length - 1];
        const lastContent = {
          from: userId,
          senderName: profile?.fullname || '',
          text: lastMessage?.text || '',
          time: lastMessage?.createdAt || new Date().toISOString(),
          delivered: false,
          readed: false,
        };

        const currentInbox = await InboxModel.findOne({
          where: { roomId: toRoomId },
        });
        if (currentInbox) {
          const nextArchivedBy = await resolveArchivedByAfterIncoming({
            archivedBy: currentInbox.archivedBy,
            ownersId: visibleOwners,
            senderId: userId,
          });

          await currentInbox.update({
            unreadMessage:
              Number(currentInbox.unreadMessage || 0) + createdPlain.length,
            content: lastContent,
            deletedBy: [],
            archivedBy: nextArchivedBy,
          });
        } else {
          await InboxModel.create({
            roomId: toRoomId,
            roomType: toRoomType || 'private',
            ownersId: visibleOwners,
            unreadMessage: createdPlain.length,
            fileId: null,
            deletedBy: [],
            content: lastContent,
          });
        }

        createdPlain.forEach((created) => {
          io.to(toRoomId).emit('chat/insert', {
            ...created,
            profile,
            file: null,
            reply: null,
          });
        });

        const inboxes = await Inbox.find({ roomId: toRoomId });
        if (inboxes[0]) {
          io.to(visibleOwners).emit('inbox/find', inboxes[0]);
        }
      } catch (error0) {
        console.error(error0.message);
      }
    }
  );
};
