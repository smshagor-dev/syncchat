const sharp = require('sharp');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const response = require('../helpers/response');
const {
  parseDataUri,
  saveBufferFile,
  deleteLocalFileByUrl,
} = require('../helpers/storage');
const { loadAppConfig } = require('../helpers/appConfig');
const ensureProfile = require('../helpers/ensureProfile');
const { appendProfilePhoto } = require('../helpers/profilePhotos');
const {
  isDefaultGroupAvatar,
  isDefaultChannelAvatar,
} = require('../helpers/avatarDefaults');

const isEntityAdmin = (entity, userId) => {
  const normalizedUserId = String(userId || '');
  if (!entity || !normalizedUserId) return false;
  if (String(entity.adminId || '') === normalizedUserId) return true;
  return Array.isArray(entity.adminsId) && entity.adminsId.includes(normalizedUserId);
};

exports.upload = async (req, res) => {
  try {
    const {
      avatar,
      crop,
      targetId = null,
      isGroup = false,
      isChannel = false,
    } = req.body;
    const { buffer } = parseDataUri(avatar);
    const appConfig = await loadAppConfig();
    const maxAvatarBytes =
      Math.max(1, Number(appConfig?.uploadLimits?.avatarMb || 10)) *
      1024 *
      1024;
    if (buffer.length > maxAvatarBytes) {
      response({
        res,
        statusCode: 413,
        success: false,
        message: `Avatar too large. Max ${appConfig?.uploadLimits?.avatarMb || 10} MB allowed.`,
      });
      return;
    }
    const image = sharp(buffer);
    const metadata = await image.metadata();

    let pipeline = image;
    if (
      crop &&
      typeof crop.x === 'number' &&
      typeof crop.y === 'number' &&
      typeof crop.width === 'number' &&
      typeof crop.height === 'number' &&
      metadata.width &&
      metadata.height
    ) {
      const left = Math.max(
        0,
        Math.min(Math.round(crop.x), Math.max(metadata.width - 1, 0))
      );
      const top = Math.max(
        0,
        Math.min(Math.round(crop.y), Math.max(metadata.height - 1, 0))
      );
      const width = Math.max(
        1,
        Math.min(Math.round(crop.width), metadata.width - left)
      );
      const height = Math.max(
        1,
        Math.min(Math.round(crop.height), metadata.height - top)
      );

      pipeline = image.extract({ left, top, width, height });
    }

    const processedBuffer = await pipeline
      .resize(460, 460, { fit: 'cover' })
      .webp({ quality: 90 })
      .toBuffer();

    const uploadOwnerId = isGroup || isChannel ? targetId : req.user._id;

    // Validate group/channel ownership before writing the file so unauthorized
    // requests cannot create orphan media in FTP storage.
    let channel = null;
    let group = null;
    if (isChannel) {
      channel = await ChannelModel.findOne({
        where: { _id: targetId },
        attributes: [
          '_id',
          'avatar',
          'roomId',
          'participantsId',
          'adminId',
          'adminsId',
        ],
      });
      if (!channel) {
        response({
          res,
          statusCode: 404,
          success: false,
          message: 'Channel not found',
        });
        return;
      }
      if (!isEntityAdmin(channel, req.user._id)) {
        response({
          res,
          statusCode: 403,
          success: false,
          message: 'Only channel admins can change the channel photo',
        });
        return;
      }
    } else if (isGroup) {
      group = await GroupModel.findOne({
        where: { _id: targetId },
        attributes: [
          '_id',
          'avatar',
          'roomId',
          'participantsId',
          'adminId',
          'adminsId',
        ],
      });
      if (!group) {
        response({
          res,
          statusCode: 404,
          success: false,
          message: 'Group not found',
        });
        return;
      }
      if (!isEntityAdmin(group, req.user._id)) {
        response({
          res,
          statusCode: 403,
          success: false,
          message: 'Only group admins can change the group photo',
        });
        return;
      }
    }

    const uploaded = await saveBufferFile({
      buffer: processedBuffer,
      folder: 'avatars',
      filename: `${uploadOwnerId}-${Date.now()}.webp`,
    });

    if (isChannel) {
      if (channel?.avatar && !isDefaultChannelAvatar(channel.avatar)) {
        await deleteLocalFileByUrl(channel.avatar);
      }

      await ChannelModel.update(
        { avatar: uploaded.publicPath },
        { where: { _id: targetId } }
      );

      if (channel?.roomId && global?.io) {
        const payload = {
          channelId: channel._id,
          roomId: channel.roomId,
          avatar: uploaded.publicPath,
        };
        global.io.to(channel.roomId).emit('channel/avatar', payload);
        if (Array.isArray(channel.participantsId) && channel.participantsId.length) {
          global.io.to(channel.participantsId).emit('channel/avatar', payload);
        }
      }
    } else if (isGroup) {
      if (group?.avatar && !isDefaultGroupAvatar(group.avatar)) {
        await deleteLocalFileByUrl(group.avatar);
      }

      await GroupModel.update(
        { avatar: uploaded.publicPath },
        { where: { _id: targetId } }
      );

      if (group?.roomId && global?.io) {
        const payload = {
          groupId: group._id,
          roomId: group.roomId,
          avatar: uploaded.publicPath,
        };
        // Emit to room watchers and all group members so inbox list updates instantly.
        global.io.to(group.roomId).emit('group/avatar', payload);
        if (Array.isArray(group.participantsId) && group.participantsId.length) {
          global.io.to(group.participantsId).emit('group/avatar', payload);
        }
      }
    } else {
      // User profile photos are retained as history. They are removed from FTP
      // only when the owner explicitly deletes them from the profile-photo viewer.
      const userId = req.user._id;
      const profile = await ensureProfile(userId);
      if (!profile) {
        response({
          res,
          statusCode: 404,
          success: false,
          message: 'User profile not found',
        });
        return;
      }

      await appendProfilePhoto({
        profile,
        url: uploaded.publicPath,
        source: 'upload',
      });

      if (global?.io) {
        global.io.emit('profile/avatar-changed', {
          userId,
          at: new Date().toISOString(),
        });
      }
    }

    response({
      res,
      message: 'Avatar uploaded successfully',
      payload: uploaded.publicPath,
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
