const FileModel = require('../db/models/file');
const InboxModel = require('../db/models/inbox');
const { asArray, toPlain } = require('../db/utils');

const getViewOnceType = ({ text = '', file = null, explicitType = null }) => {
  if (explicitType && ['text', 'image', 'video'].includes(explicitType)) {
    return explicitType;
  }
  if (file?.type === 'image') return 'image';
  if (file?.type === 'video') return 'video';
  if (String(text || '').trim()) return 'text';
  return 'none';
};

const isViewOnceChat = (chat) => !!chat?.viewOnce && chat?.viewOnceType !== 'none';

const hasViewedOnce = (chat, userId) =>
  isViewOnceChat(chat) && asArray(chat?.viewOnceOpenedBy).includes(userId);

const getViewOncePreviewText = (chat, file = null) => {
  switch (chat?.viewOnceType) {
    case 'image':
      return 'Photo';
    case 'video':
      return 'Video';
    case 'text':
      return 'Encrypted message';
    default:
      return file?.originalname || 'Encrypted message';
  }
};

const buildViewOnceDisplay = ({ chat, userId, file = null }) => {
  if (!isViewOnceChat(chat)) return null;
  const opened = hasViewedOnce(chat, userId);
  return {
    enabled: true,
    type: chat.viewOnceType,
    opened,
    label: opened ? 'Opened' : 'Tap to open',
    previewText: getViewOncePreviewText(chat, file),
  };
};

const canAccessRoom = async ({ chat, userId }) => {
  const inbox = await InboxModel.findOne({
    where: { roomId: chat.roomId },
    attributes: ['ownersId'],
  });
  return asArray(toPlain(inbox)?.ownersId).includes(userId);
};

const openViewOnceChat = async ({ chat, userId }) => {
  if (!isViewOnceChat(chat)) {
    throw new Error('This message is not a one-time message');
  }
  if (!(await canAccessRoom({ chat, userId }))) {
    throw new Error('You do not have access to this message');
  }
  if (hasViewedOnce(chat, userId)) {
    throw new Error('This one-time message has already been opened');
  }

  const openedBy = asArray(chat.viewOnceOpenedBy);
  openedBy.push(userId);
  await chat.update({ viewOnceOpenedBy: [...new Set(openedBy)] });

  const file = chat.fileId
    ? toPlain(
        await FileModel.findOne({
          where: { fileId: chat.fileId },
        })
      )
    : null;

  return {
    _id: chat._id,
    roomId: chat.roomId,
    viewOnce: true,
    viewOnceType: chat.viewOnceType,
    text: chat.text || '',
    file,
  };
};

module.exports = {
  getViewOnceType,
  isViewOnceChat,
  hasViewedOnce,
  getViewOncePreviewText,
  buildViewOnceDisplay,
  openViewOnceChat,
};
