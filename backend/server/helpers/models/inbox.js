const { Op } = require('sequelize');
const InboxModel = require('../../db/models/inbox');
const ProfileModel = require('../../db/models/profile');
const GroupModel = require('../../db/models/group');
const ChannelModel = require('../../db/models/channel');
const FileModel = require('../../db/models/file');
const { asArray, toPlainMany } = require('../../db/utils');
const {
  buildPrivacyContext,
  sanitizeProfileForViewer,
} = require('../privacy');

const hasAll = (source, values) =>
  asArray(values).every((value) => asArray(source).includes(value));

const isMatch = (inbox, queries = {}) => {
  if (!queries || Object.keys(queries).length === 0) return true;

  return Object.entries(queries).every(([key, value]) => {
    if (key === 'ownersId') {
      if (value && typeof value === 'object' && value.$all) {
        return hasAll(inbox.ownersId, value.$all);
      }

      return asArray(inbox.ownersId).includes(value);
    }

    if (value && typeof value === 'object' && value.$ne !== undefined) {
      if (Array.isArray(inbox[key])) {
        return !inbox[key].includes(value.$ne);
      }
      return inbox[key] !== value.$ne;
    }

    return inbox[key] === value;
  });
};

exports.find = async (queries, search = '', options = {}) => {
  const viewerId =
    typeof queries?.ownersId === 'string' ? String(queries.ownersId) : null;
  const includeHidden = !!options.includeHidden;
  const inboxesRaw = await InboxModel.findAll();
  const inboxes = toPlainMany(inboxesRaw).filter((inbox) =>
    isMatch(inbox, queries)
  );

  if (inboxes.length === 0) return [];

  const ownersIds = [
    ...new Set(inboxes.flatMap((inbox) => asArray(inbox.ownersId))),
  ];
  const roomIds = [...new Set(inboxes.map((inbox) => inbox.roomId))];
  const fileIds = [
    ...new Set(inboxes.map((inbox) => inbox.fileId).filter(Boolean)),
  ];

  const [ownersRaw, groupsRaw, channelsRaw, filesRaw] = await Promise.all([
    ownersIds.length
      ? ProfileModel.findAll({ where: { userId: { [Op.in]: ownersIds } } })
      : [],
    roomIds.length
      ? GroupModel.findAll({
          where: { roomId: { [Op.in]: roomIds } },
          attributes: { exclude: ['passwordHash'] },
        })
      : [],
    roomIds.length
      ? ChannelModel.findAll({
          where: { roomId: { [Op.in]: roomIds } },
          attributes: { exclude: ['passwordHash'] },
        })
      : [],
    fileIds.length
      ? FileModel.findAll({ where: { fileId: { [Op.in]: fileIds } } })
      : [],
  ]);

  const ownersById = new Map(
    toPlainMany(ownersRaw).map((profile) => [profile.userId, profile])
  );
  const groupsByRoom = new Map(
    toPlainMany(groupsRaw).map((group) => [group.roomId, group])
  );
  const channelsByRoom = new Map(
    toPlainMany(channelsRaw).map((channel) => [channel.roomId, channel])
  );
  const filesById = new Map(
    toPlainMany(filesRaw).map((file) => [file.fileId, file])
  );

  const regex = new RegExp(search || '', 'i');
  const privacy = await buildPrivacyContext({
    viewerId,
    targetIds: ownersIds,
  });

  return inboxes
    .map((inbox) => {
      const sanitized = { ...inbox };
      delete sanitized.chatLockHashes;
      delete sanitized.secretSessionKey;

      return {
      ...sanitized,
      owners: asArray(inbox.ownersId)
        .map((ownerId) =>
          ownersById.get(ownerId)
            ? sanitizeProfileForViewer({
                profile: ownersById.get(ownerId),
                viewerId,
                setting: privacy.settingMap.get(ownerId),
                isViewerContact: privacy.isViewerContact(ownerId),
              })
            : null
        )
        .filter(Boolean),
      group: groupsByRoom.get(inbox.roomId) || null,
      channel: channelsByRoom.get(inbox.roomId) || null,
      file: inbox.fileId ? filesById.get(inbox.fileId) || null : null,
    }})
    .filter((inbox) => {
      if (viewerId && asArray(inbox.deletedBy).includes(viewerId)) {
        return false;
      }
      if (!includeHidden && viewerId && asArray(inbox.hiddenBy).includes(viewerId)) {
        return false;
      }
      if (!search) return true;
      if (inbox.roomType === 'private') {
        return inbox.owners.some((owner) => regex.test(owner.fullname || ''));
      }
      return regex.test(inbox.channel?.name || inbox.group?.name || '');
    })
    .sort((a, b) => {
      if (viewerId) {
        const aPinned = asArray(a.pinnedBy).includes(viewerId);
        const bPinned = asArray(b.pinnedBy).includes(viewerId);
        if (aPinned !== bPinned) return bPinned - aPinned;
      }

      return (
        new Date(b.content?.time || 0).getTime() -
        new Date(a.content?.time || 0).getTime()
      );
    });
};
