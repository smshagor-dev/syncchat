const sharp = require('sharp');
const ProfileModel = require('../db/models/profile');
const GroupModel = require('../db/models/group');
const response = require('../helpers/response');
const {
  parseDataUri,
  saveBufferFile,
  deleteLocalFileByUrl,
} = require('../helpers/storage');

exports.upload = async (req, res) => {
  try {
    const { avatar, crop, targetId = null, isGroup = false } = req.body;
    const { buffer } = parseDataUri(avatar);
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

    if (isGroup) {
      const group = await GroupModel.findOne({
        where: { _id: targetId },
        attributes: ['avatar'],
      });
      if (group?.avatar) await deleteLocalFileByUrl(group.avatar);

      await GroupModel.update(
        { avatar: uploaded.url },
        { where: { _id: targetId } }
      );
    } else {
      const userId = targetId || req.user._id;
      const profile = await ProfileModel.findOne({
        where: { userId },
        attributes: ['avatar'],
      });
      if (profile?.avatar) await deleteLocalFileByUrl(profile.avatar);

      await ProfileModel.update(
        { avatar: uploaded.url },
        { where: { userId } }
      );
    }

    response({
      res,
      message: 'Avatar uploaded successfully',
      payload: uploaded.url,
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
