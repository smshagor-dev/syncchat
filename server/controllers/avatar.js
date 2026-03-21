const sharp = require('sharp');
const ProfileModel = require('../db/models/profile');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const response = require('../helpers/response');
const {
  parseDataUri,
  saveBufferFile,
  deleteLocalFileByUrl,
} = require('../helpers/storage');
const { loadAppConfig } = require('../helpers/appConfig');

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

    const uploaded = await saveBufferFile({
      buffer: processedBuffer,
      folder: 'avatars',
      filename: `${targetId || req.user._id}-${Date.now()}.webp`,
    });

    if (isChannel) {
      const channel = await ChannelModel.findOne({
        where: { _id: targetId },
        attributes: ['_id', 'avatar', 'roomId', 'participantsId'],
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
      if (channel?.avatar) await deleteLocalFileByUrl(channel.avatar);

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
      const group = await GroupModel.findOne({
        where: { _id: targetId },
        attributes: ['_id', 'avatar', 'roomId', 'participantsId'],
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
      if (group?.avatar) await deleteLocalFileByUrl(group.avatar);

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
      const userId = targetId || req.user._id;
      const profile = await ProfileModel.findOne({
        where: { userId },
        attributes: ['avatar'],
      });
      if (!profile) {
        response({
          res,
          statusCode: 404,
          success: false,
          message: 'Profile not found',
        });
        return;
      }
      if (profile?.avatar) await deleteLocalFileByUrl(profile.avatar);

      await ProfileModel.update(
        { avatar: uploaded.publicPath },
        { where: { userId } }
      );
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
