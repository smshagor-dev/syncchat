const ProfileModel = require('../db/models/profile');
const ContactModel = require('../db/models/contact');
const SettingModel = require('../db/models/setting');
const { toPlain } = require('../db/utils');
const response = require('../helpers/response');
const { toAbsoluteUploadUrl } = require('../helpers/storage');

exports.findById = async (req, res) => {
  try {
    const targetId = req.params.userId;
    const friendProfile = targetId !== req.user._id;

    const profile = await ProfileModel.findOne({ where: { userId: targetId } });
    const contact = friendProfile
      ? await ContactModel.findOne({
          where: {
            userId: req.user._id,
            friendId: targetId,
          },
        })
      : false;
    const setting = await SettingModel.findOne({
      where: { userId: req.user._id },
      attributes: ['blockedUserIds'],
    });

    const payload = toPlain(profile);
    response({
      res,
      payload: {
        ...payload,
        avatar: toAbsoluteUploadUrl(payload?.avatar),
        saved: !!contact,
        blocked: !!toPlain(setting)?.blockedUserIds?.includes(targetId),
      },
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

exports.edit = async (req, res) => {
  try {
    const [affectedRows] = await ProfileModel.update(req.body, {
      where: { userId: req.user._id },
    });

    response({
      res,
      message: 'Profile updated successfully',
      payload: { affectedRows },
    });
  } catch (error0) {
    if (error0.name === 'SequelizeUniqueConstraintError') {
      switch (Object.keys(req.body)[0]) {
        case 'username':
          error0.message = 'This username is already taken';
          break;
        case 'phone':
          error0.message = 'This phone number is already taken';
          break;
        default:
          break;
      }
    }

    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
