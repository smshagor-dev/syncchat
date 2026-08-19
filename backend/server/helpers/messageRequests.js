const MessageRequestModel = require('../db/models/messageRequest');
const InboxModel = require('../db/models/inbox');
const { getSettingMap, getContactMap } = require('./privacy');
const { asArray, addToSet, toPlain } = require('../db/utils');

const shouldStageMessageRequest = async ({ senderId, recipientId }) => {
  if (!senderId || !recipientId || senderId === recipientId) return false;
  const [settings, contacts] = await Promise.all([
    getSettingMap([recipientId]),
    getContactMap({ ownerIds: [recipientId], friendIds: [senderId] }),
  ]);
  if (contacts.get(`${recipientId}:${senderId}`)) return false;
  const setting = settings.get(recipientId);
  return setting?.messageRequestsEnabled !== false;
};

const upsertMessageRequest = async ({ senderId, recipientId, roomId, preview = '' }) => {
  if (!(await shouldStageMessageRequest({ senderId, recipientId }))) return null;

  let row = await MessageRequestModel.findOne({
    where: { recipientId, roomId },
  });
  const patch = {
    requesterId: senderId,
    recipientId,
    roomId,
    status: row?.status === 'accepted' ? 'accepted' : 'pending',
    preview: String(preview || '').slice(0, 320),
    lastMessageAt: new Date(),
    actionAt: row?.status === 'accepted' ? row.actionAt : null,
  };

  if (row) await row.update(patch);
  else row = await MessageRequestModel.create(patch);

  if (row.status === 'pending') {
    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (inbox) {
      await inbox.update({
        requestPendingFor: addToSet(inbox.requestPendingFor, [recipientId]),
      });
    }
  }

  return toPlain(row);
};

const clearPendingFor = async ({ roomId, userId }) => {
  const inbox = await InboxModel.findOne({ where: { roomId } });
  if (!inbox) return null;
  const next = asArray(inbox.requestPendingFor).filter((id) => id !== userId);
  await inbox.update({ requestPendingFor: next });
  return inbox;
};

module.exports = {
  shouldStageMessageRequest,
  upsertMessageRequest,
  clearPendingFor,
};
