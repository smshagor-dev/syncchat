const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const axios = require('axios');
const { Op } = require('sequelize');

const ChatModel = require('../db/models/chat');
const InboxModel = require('../db/models/inbox');
const FileModel = require('../db/models/file');
const ProfileModel = require('../db/models/profile');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const SettingModel = require('../db/models/setting');
const MessageReceiptModel = require('../db/models/messageReceipt');
const ChatDraftModel = require('../db/models/chatDraft');
const MessageRequestModel = require('../db/models/messageRequest');
const ChatTopicModel = require('../db/models/chatTopic');
const E2eeDeviceKeyModel = require('../db/models/e2eeDeviceKey');
const ResumableUploadModel = require('../db/models/resumableUpload');

const response = require('../helpers/response');
const {
  asArray,
  addToSet,
  pullFromArray,
  toPlain,
  toPlainMany,
} = require('../db/utils');
const { clearPendingFor } = require('../helpers/messageRequests');
const { loadAppConfig } = require('../helpers/appConfig');
const { saveBufferFile, readStorageFileToBuffer } = require('../helpers/storage');
const { getRuntimeChatAiConfig } = require('../helpers/chatAiConfig');

const unique = (values) => [...new Set(asArray(values).filter(Boolean))];

const ensureRoomAccess = async ({ roomId, userId }) => {
  const inbox = await InboxModel.findOne({ where: { roomId } });
  if (!inbox) {
    const error = new Error('Room not found');
    error.statusCode = 404;
    throw error;
  }
  if (!asArray(inbox.ownersId).includes(userId)) {
    const error = new Error('Forbidden');
    error.statusCode = 403;
    throw error;
  }
  return inbox;
};

const getRoomAdminState = async ({ roomId, userId }) => {
  const [channel, group] = await Promise.all([
    ChannelModel.findOne({ where: { roomId } }),
    GroupModel.findOne({ where: { roomId } }),
  ]);
  const entity = toPlain(channel) || toPlain(group);
  if (!entity) return { entity: null, isAdmin: false };
  const admins = unique([entity.adminId, ...asArray(entity.adminsId)]);
  return { entity, isAdmin: admins.includes(userId) };
};

const emitToOwners = (inbox, event, payload) => {
  if (!global?.io || !inbox) return;
  asArray(inbox.ownersId).forEach((ownerId) => global.io.to(ownerId).emit(event, payload));
  if (inbox.roomId) global.io.to(inbox.roomId).emit(event, payload);
};

const fileTypeFromMime = (mime = '', filename = '') => {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.startsWith('image/')) return 'image';
  if (normalized.startsWith('video/')) return 'video';
  if (normalized.startsWith('audio/')) return 'audio';
  const ext = path.extname(String(filename || '')).slice(1).toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'mkv', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'webm'].includes(ext)) return 'audio';
  return 'document';
};

const safeFileName = (value = 'file.bin') => {
  const base = path.basename(String(value || 'file.bin')).replace(/[^a-zA-Z0-9._ -]/g, '_').trim();
  return base.slice(0, 180) || 'file.bin';
};

exports.getMessageReceipts = async (req, res) => {
  try {
    const chat = await ChatModel.findOne({ where: { _id: req.params.chatId } });
    if (!chat) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
    await ensureRoomAccess({ roomId: chat.roomId, userId: req.user._id });

    const rows = await MessageReceiptModel.findAll({
      where: { chatId: chat._id },
      order: [['readAt', 'DESC'], ['deliveredAt', 'DESC']],
    });
    const receipts = toPlainMany(rows);
    const userIds = unique(receipts.map((item) => item.userId));
    const profiles = userIds.length
      ? toPlainMany(await ProfileModel.findAll({
          where: { userId: { [Op.in]: userIds } },
          attributes: ['userId', 'fullname', 'username', 'avatar'],
        }))
      : [];
    const profileMap = new Map(profiles.map((item) => [item.userId, item]));

    response({
      res,
      payload: receipts.map((item) => ({ ...item, profile: profileMap.get(item.userId) || null })),
    });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.listDrafts = async (req, res) => {
  try {
    const rows = await ChatDraftModel.findAll({
      where: { userId: req.user._id },
      order: [['updatedAt', 'DESC']],
      limit: 200,
    });
    response({ res, payload: toPlainMany(rows) });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.getDraft = async (req, res) => {
  try {
    await ensureRoomAccess({ roomId: req.params.roomId, userId: req.user._id });
    const row = await ChatDraftModel.findOne({
      where: { userId: req.user._id, roomId: req.params.roomId },
    });
    response({ res, payload: toPlain(row) || null });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.saveDraft = async (req, res) => {
  try {
    const roomId = String(req.params.roomId || '');
    await ensureRoomAccess({ roomId, userId: req.user._id });
    const patch = {
      userId: req.user._id,
      roomId,
      text: String(req.body?.text || '').slice(0, 20000),
      replyTo: req.body?.replyTo || null,
      topicId: req.body?.topicId || null,
      meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {},
    };
    let row = await ChatDraftModel.findOne({ where: { userId: req.user._id, roomId } });
    if (row) await row.update(patch);
    else row = await ChatDraftModel.create(patch);
    response({ res, message: 'Draft saved', payload: toPlain(row) });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.deleteDraft = async (req, res) => {
  try {
    await ChatDraftModel.destroy({ where: { userId: req.user._id, roomId: req.params.roomId } });
    response({ res, message: 'Draft cleared' });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.listMentions = async (req, res) => {
  try {
    const inboxes = toPlainMany(await InboxModel.findAll()).filter(
      (inbox) => asArray(inbox.ownersId).includes(req.user._id) && !asArray(inbox.deletedBy).includes(req.user._id)
    );
    const roomIds = inboxes.map((item) => item.roomId);
    if (!roomIds.length) return response({ res, payload: [] });

    const rows = await ChatModel.findAll({
      where: {
        roomId: { [Op.in]: roomIds },
        mentionUserIds: { [Op.contains]: [req.user._id] },
      },
      order: [['createdAt', 'DESC']],
      limit: Math.min(200, Math.max(1, Number(req.query.limit || 50))),
    });
    response({ res, payload: toPlainMany(rows).filter((chat) => !asArray(chat.deletedBy).includes(req.user._id)) });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.searchMessages = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const requestedRoomId = String(req.query.roomId || '').trim();
    const senderId = String(req.query.senderId || '').trim();
    const type = String(req.query.type || 'all').trim().toLowerCase();
    const topicId = String(req.query.topicId || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));

    const inboxes = toPlainMany(await InboxModel.findAll()).filter(
      (inbox) =>
        asArray(inbox.ownersId).includes(req.user._id) &&
        !asArray(inbox.deletedBy).includes(req.user._id) &&
        (!requestedRoomId || inbox.roomId === requestedRoomId)
    );
    const roomIds = inboxes.map((item) => item.roomId);
    if (!roomIds.length) return response({ res, payload: [] });

    const where = { roomId: { [Op.in]: roomIds } };
    if (q) where.text = { [Op.iLike]: `%${q}%` };
    if (senderId) where.userId = senderId;
    if (topicId) where.topicId = topicId;
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt[Op.gte] = new Date(req.query.from);
      if (req.query.to) where.createdAt[Op.lte] = new Date(req.query.to);
    }

    let rows = toPlainMany(await ChatModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: Math.min(1000, limit * 8),
    })).filter((chat) => !asArray(chat.deletedBy).includes(req.user._id));

    const fileIds = unique(rows.map((chat) => chat.fileId));
    const files = fileIds.length
      ? toPlainMany(await FileModel.findAll({ where: { fileId: { [Op.in]: fileIds } } }))
      : [];
    const fileMap = new Map(files.map((file) => [file.fileId, file]));

    if (type !== 'all') {
      rows = rows.filter((chat) => {
        const file = chat.fileId ? fileMap.get(chat.fileId) : null;
        if (['image', 'video', 'audio', 'document'].includes(type)) return file?.type === type;
        if (type === 'link') return /https?:\/\/\S+/i.test(chat.text || '');
        if (type === 'call') return /\b(call|missed|declined|rejected)\b/i.test(chat.text || '');
        if (type === 'poll') return String(chat.text || '').startsWith('__poll__::');
        if (type === 'text') return !file && !!String(chat.text || '').trim();
        return true;
      });
    }

    rows = rows.slice(0, limit);
    const senderIds = unique(rows.map((chat) => chat.userId));
    const profiles = senderIds.length
      ? toPlainMany(await ProfileModel.findAll({
          where: { userId: { [Op.in]: senderIds } },
          attributes: ['userId', 'fullname', 'username', 'avatar'],
        }))
      : [];
    const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
    const inboxMap = new Map(inboxes.map((inbox) => [inbox.roomId, inbox]));

    response({
      res,
      payload: rows.map((chat) => ({
        ...chat,
        profile: profileMap.get(chat.userId) || null,
        file: chat.fileId ? fileMap.get(chat.fileId) || null : null,
        room: inboxMap.get(chat.roomId) || null,
      })),
    });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.getEditHistory = async (req, res) => {
  try {
    const chat = await ChatModel.findOne({ where: { _id: req.params.chatId } });
    if (!chat) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
    await ensureRoomAccess({ roomId: chat.roomId, userId: req.user._id });
    response({
      res,
      payload: {
        chatId: chat._id,
        currentText: chat.e2eeEnvelope ? 'Encrypted message' : chat.text,
        isEdited: !!chat.isEdited,
        editedAt: chat.editedAt || null,
        history: asArray(chat.editHistory),
      },
    });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.listMessageRequests = async (req, res) => {
  try {
    const rows = toPlainMany(await MessageRequestModel.findAll({
      where: { recipientId: req.user._id, status: 'pending' },
      order: [['lastMessageAt', 'DESC']],
      limit: 200,
    }));
    const requesterIds = unique(rows.map((item) => item.requesterId));
    const profiles = requesterIds.length
      ? toPlainMany(await ProfileModel.findAll({
          where: { userId: { [Op.in]: requesterIds } },
          attributes: ['userId', 'fullname', 'username', 'avatar', 'bio'],
        }))
      : [];
    const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
    response({
      res,
      payload: rows.map((item) => ({ ...item, profile: profileMap.get(item.requesterId) || null })),
    });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.actionMessageRequest = async (req, res) => {
  try {
    const action = String(req.body?.action || '').toLowerCase();
    if (!['accept', 'decline', 'block'].includes(action)) {
      return response({ res, statusCode: 400, success: false, message: 'Unsupported request action' });
    }
    const row = await MessageRequestModel.findOne({
      where: { _id: req.params.requestId, recipientId: req.user._id },
    });
    if (!row) throw Object.assign(new Error('Message request not found'), { statusCode: 404 });

    const status = action === 'accept' ? 'accepted' : action === 'block' ? 'blocked' : 'declined';
    await row.update({ status, actionAt: new Date() });
    const inbox = await clearPendingFor({ roomId: row.roomId, userId: req.user._id });

    if (action !== 'accept' && inbox) {
      await inbox.update({ deletedBy: addToSet(inbox.deletedBy, [req.user._id]) });
      const chats = await ChatModel.findAll({ where: { roomId: row.roomId } });
      await Promise.all(chats.map((chat) => chat.update({ deletedBy: addToSet(chat.deletedBy, [req.user._id]) })));
    }

    if (action === 'block') {
      const setting = await SettingModel.findOne({ where: { userId: req.user._id } });
      if (setting) await setting.update({ blockedUserIds: addToSet(setting.blockedUserIds, [row.requesterId]) });
    }

    if (global?.io) {
      global.io.to(req.user._id).emit('message-request/updated', {
        requestId: row._id,
        roomId: row.roomId,
        status,
      });
      global.io.to(row.requesterId).emit('message-request/updated', {
        requestId: row._id,
        roomId: row.roomId,
        status,
      });
      if (action === 'accept') global.io.to(req.user._id).emit('inbox/refresh', { roomId: row.roomId });
      else global.io.to(req.user._id).emit('inbox/delete', [row.roomId]);
    }

    response({ res, message: `Message request ${status}`, payload: toPlain(row) });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.listTopics = async (req, res) => {
  try {
    await ensureRoomAccess({ roomId: req.params.roomId, userId: req.user._id });
    const rows = await ChatTopicModel.findAll({
      where: { roomId: req.params.roomId },
      order: [['pinned', 'DESC'], ['updatedAt', 'DESC']],
    });
    response({ res, payload: toPlainMany(rows) });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.createTopic = async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const inbox = await ensureRoomAccess({ roomId, userId: req.user._id });
    if (inbox.roomType !== 'group') {
      return response({ res, statusCode: 400, success: false, message: 'Topics are only available in groups and channels' });
    }
    const { isAdmin } = await getRoomAdminState({ roomId, userId: req.user._id });
    if (!isAdmin) return response({ res, statusCode: 403, success: false, message: 'Only an admin can create topics' });
    const name = String(req.body?.name || '').trim();
    if (name.length < 2 || name.length > 120) {
      return response({ res, statusCode: 400, success: false, message: 'Topic name must be 2-120 characters' });
    }
    const topic = await ChatTopicModel.create({
      roomId,
      name,
      icon: String(req.body?.icon || 'topic').slice(0, 32),
      createdBy: req.user._id,
      pinned: !!req.body?.pinned,
      closed: false,
      participantIds: [],
    });
    emitToOwners(inbox, 'chat/topic', { action: 'created', topic: toPlain(topic) });
    response({ res, message: 'Topic created', payload: toPlain(topic) });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.updateTopic = async (req, res) => {
  try {
    const topic = await ChatTopicModel.findOne({ where: { _id: req.params.topicId } });
    if (!topic) throw Object.assign(new Error('Topic not found'), { statusCode: 404 });
    const inbox = await ensureRoomAccess({ roomId: topic.roomId, userId: req.user._id });
    const { isAdmin } = await getRoomAdminState({ roomId: topic.roomId, userId: req.user._id });
    if (!isAdmin && topic.createdBy !== req.user._id) {
      return response({ res, statusCode: 403, success: false, message: 'Only topic creator or admin can update this topic' });
    }
    const patch = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name || '').trim().slice(0, 120);
    if (req.body?.icon !== undefined) patch.icon = String(req.body.icon || 'topic').slice(0, 32);
    if (req.body?.closed !== undefined) patch.closed = !!req.body.closed;
    if (req.body?.pinned !== undefined) patch.pinned = !!req.body.pinned;
    await topic.update(patch);
    emitToOwners(inbox, 'chat/topic', { action: 'updated', topic: toPlain(topic) });
    response({ res, message: 'Topic updated', payload: toPlain(topic) });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.deleteTopic = async (req, res) => {
  try {
    const topic = await ChatTopicModel.findOne({ where: { _id: req.params.topicId } });
    if (!topic) return response({ res, message: 'Topic deleted' });
    const inbox = await ensureRoomAccess({ roomId: topic.roomId, userId: req.user._id });
    const { isAdmin } = await getRoomAdminState({ roomId: topic.roomId, userId: req.user._id });
    if (!isAdmin && topic.createdBy !== req.user._id) {
      return response({ res, statusCode: 403, success: false, message: 'Only topic creator or admin can delete this topic' });
    }
    await ChatModel.update({ topicId: null }, { where: { topicId: topic._id } });
    await topic.destroy();
    emitToOwners(inbox, 'chat/topic', { action: 'deleted', topicId: req.params.topicId, roomId: topic.roomId });
    response({ res, message: 'Topic deleted' });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.registerE2eeKey = async (req, res) => {
  try {
    const sessionId = req.session?._id || req.sessionId || req.token?.sid;
    if (!sessionId) return response({ res, statusCode: 409, success: false, message: 'A device session is required for E2EE' });
    const publicJwk = req.body?.publicJwk;
    const fingerprint = String(req.body?.fingerprint || '').trim().slice(0, 128);
    if (!publicJwk || typeof publicJwk !== 'object' || !fingerprint) {
      return response({ res, statusCode: 400, success: false, message: 'publicJwk and fingerprint are required' });
    }
    let row = await E2eeDeviceKeyModel.findOne({ where: { userId: req.user._id, sessionId } });
    const changed = !!row && row.fingerprint !== fingerprint;
    const patch = {
      userId: req.user._id,
      sessionId,
      publicJwk,
      fingerprint,
      algorithm: 'ECDH-P256',
      active: true,
      revokedAt: null,
    };
    if (row) await row.update(patch);
    else row = await E2eeDeviceKeyModel.create(patch);
    if (changed && global?.io) global.io.to(req.user._id).emit('e2ee/key-changed', { sessionId, fingerprint });
    response({ res, message: 'E2EE device key registered', payload: { sessionId, fingerprint, algorithm: 'ECDH-P256' } });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.listE2eeKeys = async (req, res) => {
  try {
    const ids = unique(String(req.query.userIds || '').split(',').map((item) => item.trim())).slice(0, 100);
    if (!ids.length) return response({ res, payload: [] });
    const rows = await E2eeDeviceKeyModel.findAll({
      where: { userId: { [Op.in]: ids }, active: true },
      attributes: ['userId', 'sessionId', 'publicJwk', 'fingerprint', 'algorithm', 'updatedAt'],
    });
    response({ res, payload: toPlainMany(rows) });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.setRoomE2ee = async (req, res) => {
  try {
    const roomId = req.params.roomId;
    const inbox = await ensureRoomAccess({ roomId, userId: req.user._id });
    if (inbox.roomType !== 'private') {
      return response({ res, statusCode: 400, success: false, message: 'Device E2EE is currently available for private chats only' });
    }
    const enabled = !!req.body?.enabled;
    if (enabled) {
      const owners = asArray(inbox.ownersId);
      const keys = toPlainMany(await E2eeDeviceKeyModel.findAll({
        where: { userId: { [Op.in]: owners }, active: true },
      }));
      const keyed = new Set(keys.map((item) => item.userId));
      const missingUserIds = owners.filter((id) => !keyed.has(id));
      if (missingUserIds.length) {
        return response({
          res,
          statusCode: 409,
          success: false,
          message: 'Every participant needs at least one registered E2EE device key',
          payload: { missingUserIds },
        });
      }
    }
    await inbox.update({
      e2eeEnabled: enabled,
      e2eeEnabledBy: enabled ? req.user._id : null,
      e2eeVersion: enabled ? 1 : 0,
    });
    emitToOwners(inbox, 'e2ee/room', {
      roomId,
      enabled,
      enabledBy: enabled ? req.user._id : null,
      version: enabled ? 1 : 0,
    });
    response({ res, message: enabled ? 'E2EE enabled' : 'E2EE disabled', payload: { roomId, enabled, version: enabled ? 1 : 0 } });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.getRoomE2ee = async (req, res) => {
  try {
    const inbox = await ensureRoomAccess({ roomId: req.params.roomId, userId: req.user._id });
    response({
      res,
      payload: {
        roomId: inbox.roomId,
        enabled: !!inbox.e2eeEnabled,
        enabledBy: inbox.e2eeEnabledBy || null,
        version: Number(inbox.e2eeVersion || 0),
      },
    });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.initResumableUpload = async (req, res) => {
  try {
    const appConfig = await loadAppConfig();
    const filename = safeFileName(req.body?.filename);
    const mime = String(req.body?.mime || 'application/octet-stream').slice(0, 120);
    const totalSize = Number(req.body?.totalSize || 0);
    const maxBytes = Math.max(1, Number(appConfig?.uploadLimits?.chatMb || 100)) * 1024 * 1024;
    if (!Number.isFinite(totalSize) || totalSize <= 0 || totalSize > maxBytes) {
      return response({ res, statusCode: 413, success: false, message: `Upload must be between 1 byte and ${appConfig?.uploadLimits?.chatMb || 100} MB` });
    }
    const chunkSize = Math.min(4 * 1024 * 1024, Math.max(256 * 1024, Number(req.body?.chunkSize || 1024 * 1024)));
    const uploadId = crypto.randomUUID();
    const row = await ResumableUploadModel.create({
      uploadId,
      userId: req.user._id,
      filename,
      mime,
      totalSize,
      chunkSize,
      uploadedBytes: 0,
      receivedParts: [],
      status: 'uploading',
      result: {},
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    response({ res, message: 'Resumable upload created', payload: toPlain(row) });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.putResumableChunk = async (req, res) => {
  try {
    const uploadId = req.params.uploadId;
    const partNumber = Number(req.params.partNumber);
    if (!Number.isInteger(partNumber) || partNumber < 0) {
      return response({ res, statusCode: 400, success: false, message: 'Invalid part number' });
    }
    const row = await ResumableUploadModel.findOne({ where: { uploadId, userId: req.user._id } });
    if (!row || row.status !== 'uploading') throw Object.assign(new Error('Upload session not found'), { statusCode: 404 });
    if (new Date(row.expiresAt).getTime() <= Date.now()) {
      await row.update({ status: 'expired' });
      return response({ res, statusCode: 410, success: false, message: 'Upload session expired' });
    }
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
    if (!buffer.length || buffer.length > Number(row.chunkSize || 0) + 1024) {
      return response({ res, statusCode: 400, success: false, message: 'Invalid chunk size' });
    }
    const collection = mongoose.connection.db.collection('resumable_upload_chunks');
    const existing = await collection.findOne({ uploadId, userId: req.user._id, partNumber });
    await collection.replaceOne(
      { uploadId, userId: req.user._id, partNumber },
      { uploadId, userId: req.user._id, partNumber, data: buffer, size: buffer.length, updatedAt: new Date() },
      { upsert: true }
    );
    const receivedParts = unique([...asArray(row.receivedParts).map(Number), partNumber]).sort((a, b) => a - b);
    const uploadedBytes = Math.min(
      Number(row.totalSize),
      Math.max(0, Number(row.uploadedBytes || 0) - Number(existing?.size || 0) + buffer.length)
    );
    await row.update({ receivedParts, uploadedBytes });
    response({ res, message: 'Chunk stored', payload: { uploadId, partNumber, uploadedBytes, totalSize: Number(row.totalSize), receivedParts } });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.getResumableUpload = async (req, res) => {
  try {
    const row = await ResumableUploadModel.findOne({ where: { uploadId: req.params.uploadId, userId: req.user._id } });
    if (!row) throw Object.assign(new Error('Upload session not found'), { statusCode: 404 });
    response({ res, payload: toPlain(row) });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.completeResumableUpload = async (req, res) => {
  try {
    const uploadId = req.params.uploadId;
    const row = await ResumableUploadModel.findOne({ where: { uploadId, userId: req.user._id } });
    if (!row || row.status !== 'uploading') throw Object.assign(new Error('Upload session not found'), { statusCode: 404 });
    const collection = mongoose.connection.db.collection('resumable_upload_chunks');
    const chunks = await collection.find({ uploadId, userId: req.user._id }).sort({ partNumber: 1 }).toArray();
    const expectedParts = Math.ceil(Number(row.totalSize) / Number(row.chunkSize));
    if (chunks.length !== expectedParts || chunks.some((chunk, index) => chunk.partNumber !== index)) {
      return response({ res, statusCode: 409, success: false, message: 'Upload is incomplete', payload: { expectedParts, receivedParts: chunks.map((item) => item.partNumber) } });
    }
    const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.data.buffer || chunk.data)));
    if (buffer.length !== Number(row.totalSize)) {
      return response({ res, statusCode: 409, success: false, message: 'Uploaded byte count does not match expected size' });
    }
    const stored = await saveBufferFile({
      buffer,
      folder: `chat/${req.user._id}`,
      filename: `${Date.now()}-${safeFileName(row.filename)}`,
    });
    const ext = path.extname(row.filename).slice(1).toLowerCase() || 'bin';
    const file = await FileModel.create({
      fileId: crypto.randomUUID(),
      originalname: row.filename,
      url: stored.url,
      type: fileTypeFromMime(row.mime, row.filename),
      format: ext.slice(0, 24),
      size: String(row.totalSize),
      duration: 0,
      thumbnailUrl: '',
      streamUrl: '',
      streamHdUrl: '',
      width: 0,
      height: 0,
    });
    await row.update({ status: 'complete', uploadedBytes: row.totalSize, result: toPlain(file) });
    await collection.deleteMany({ uploadId, userId: req.user._id });
    response({ res, message: 'Upload complete', payload: toPlain(file) });
  } catch (error0) {
    response({ res, statusCode: error0.statusCode || 500, success: false, message: error0.message });
  }
};

exports.cancelResumableUpload = async (req, res) => {
  try {
    const uploadId = req.params.uploadId;
    const row = await ResumableUploadModel.findOne({ where: { uploadId, userId: req.user._id } });
    if (row && row.status === 'uploading') await row.update({ status: 'cancelled' });
    if (mongoose.connection.db) {
      await mongoose.connection.db.collection('resumable_upload_chunks').deleteMany({ uploadId, userId: req.user._id });
    }
    response({ res, message: 'Upload cancelled' });
  } catch (error0) {
    response({ res, statusCode: 500, success: false, message: error0.message });
  }
};

exports.translateMessage = async (req, res) => {
  try {
    const chatId = req.body?.chatId || null;
    let sourceText = String(req.body?.text || '').trim();
    let chat = null;
    if (chatId) {
      chat = await ChatModel.findOne({ where: { _id: chatId } });
      if (!chat) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
      await ensureRoomAccess({ roomId: chat.roomId, userId: req.user._id });
      if (chat.e2eeEnvelope) {
        return response({ res, statusCode: 400, success: false, message: 'Server translation is disabled for E2EE messages; use an on-device translator' });
      }
      sourceText = sourceText || String(chat.text || '');
    }
    if (!sourceText) return response({ res, statusCode: 400, success: false, message: 'Text is required' });
    const config = await getRuntimeChatAiConfig();
    if (!config.translationEnabled || !config.translationUrl) {
      return response({ res, statusCode: 503, success: false, message: 'Translation provider is not configured' });
    }
    const targetLanguage = String(req.body?.targetLanguage || config.defaultTargetLanguage || 'en').slice(0, 16);
    const headers = { 'content-type': 'application/json' };
    if (config.translationApiKey) {
      headers.authorization = `Bearer ${config.translationApiKey}`;
      headers['x-api-key'] = config.translationApiKey;
    }
    const provider = await axios.post(
      config.translationUrl,
      { q: sourceText, text: sourceText, source: 'auto', target: targetLanguage, format: 'text' },
      { headers, timeout: 30000 }
    );
    const translatedText = String(
      provider.data?.translatedText || provider.data?.translation || provider.data?.text || provider.data?.output || ''
    ).trim();
    if (!translatedText) throw new Error('Translation provider returned no translated text');
    if (chat) {
      await chat.update({ translations: { ...(chat.translations || {}), [targetLanguage]: translatedText } });
    }
    response({ res, payload: { translatedText, targetLanguage } });
  } catch (error0) {
    response({ res, statusCode: error0.response?.status || error0.statusCode || 500, success: false, message: error0.response?.data?.message || error0.message });
  }
};

exports.transcribeVoice = async (req, res) => {
  try {
    const chat = await ChatModel.findOne({ where: { _id: req.body?.chatId } });
    if (!chat) throw Object.assign(new Error('Message not found'), { statusCode: 404 });
    await ensureRoomAccess({ roomId: chat.roomId, userId: req.user._id });
    if (chat.e2eeEnvelope) {
      return response({ res, statusCode: 400, success: false, message: 'Server transcription is disabled for E2EE messages' });
    }
    const file = chat.fileId ? await FileModel.findOne({ where: { fileId: chat.fileId } }) : null;
    if (!file || file.type !== 'audio') {
      return response({ res, statusCode: 400, success: false, message: 'Message does not contain an audio file' });
    }
    const config = await getRuntimeChatAiConfig();
    if (!config.transcriptionEnabled || !config.transcriptionUrl) {
      return response({ res, statusCode: 503, success: false, message: 'Transcription provider is not configured' });
    }
    const buffer = await readStorageFileToBuffer(file.url);
    const headers = { 'content-type': 'application/json' };
    if (config.transcriptionApiKey) {
      headers.authorization = `Bearer ${config.transcriptionApiKey}`;
      headers['x-api-key'] = config.transcriptionApiKey;
    }
    const provider = await axios.post(
      config.transcriptionUrl,
      {
        audioBase64: buffer.toString('base64'),
        mime: `audio/${file.format || 'webm'}`,
        filename: file.originalname,
        language: req.body?.language || 'auto',
      },
      { headers, timeout: 120000, maxBodyLength: Infinity }
    );
    const transcript = String(provider.data?.transcript || provider.data?.text || provider.data?.output || '').trim();
    if (!transcript) throw new Error('Transcription provider returned no text');
    await chat.update({ transcript: transcript.slice(0, 16000) });
    response({ res, payload: { chatId: chat._id, transcript } });
  } catch (error0) {
    response({ res, statusCode: error0.response?.status || error0.statusCode || 500, success: false, message: error0.response?.data?.message || error0.message });
  }
};
