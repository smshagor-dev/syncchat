const ProfileModel = require('../db/models/profile');
const ContactModel = require('../db/models/contact');
const SettingModel = require('../db/models/setting');
const GroupModel = require('../db/models/group');
const { toPlain } = require('../db/utils');
const response = require('../helpers/response');
const { toAbsoluteUploadUrl } = require('../helpers/storage');
const ensureProfile = require('../helpers/ensureProfile');
const {
  listProfilePhotos,
  resolveProfileByPhotoUrl,
  removeProfilePhoto,
} = require('../helpers/profilePhotos');
const {
  buildPrivacyContext,
  sanitizeProfileForViewer,
} = require('../helpers/privacy');

const EDITABLE_PROFILE_FIELDS = new Set([
  'username',
  'fullname',
  'bio',
  'phone',
  'dialCode',
  'socialAccounts',
]);

const photoVisibility = async ({ profile, viewerId }) => {
  const ownerId = String(profile?.userId || '');
  const context = await buildPrivacyContext({
    viewerId,
    targetIds: [ownerId],
  });
  const sanitized = sanitizeProfileForViewer({
    profile,
    viewerId,
    setting: context.settingMap.get(ownerId),
    isViewerContact: context.isViewerContact(ownerId),
  });

  return {
    ownerId,
    canSee: sanitized.canSeeAvatar !== false,
    currentAvatar: sanitized.avatar,
  };
};

exports.findById = async (req, res) => {
  try {
    const targetId = req.params.userId;
    const friendProfile = targetId !== req.user._id;

    // Old/partially migrated accounts may have a users document without a
    // matching profiles document. Repair it from the canonical user record.
    const profile = await ensureProfile(targetId);
    if (!profile) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'User profile not found',
      });
      return;
    }

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

    const payload = sanitizeProfileForViewer({
      profile,
      viewerId: req.user._id,
      setting: (
        await buildPrivacyContext({
          viewerId: req.user._id,
          targetIds: [targetId],
        })
      ).settingMap.get(targetId),
      isViewerContact: !!contact,
    });
    response({
      res,
      payload: {
        ...payload,
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
    const profile = await ensureProfile(req.user._id);
    if (!profile) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'User profile not found',
      });
      return;
    }

    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => EDITABLE_PROFILE_FIELDS.has(key))
    );
    if (!Object.keys(updates).length) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'No editable profile fields supplied',
      });
      return;
    }

    await profile.update(updates);

    response({
      res,
      message: 'Profile updated successfully',
      payload: { affectedRows: 1 },
    });
  } catch (error0) {
    if (
      error0.name === 'SequelizeUniqueConstraintError' ||
      error0.name === 'MongoServerError' ||
      error0.code === 11000
    ) {
      switch (Object.keys(req.body || {})[0]) {
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

exports.profilePhotos = async (req, res) => {
  try {
    const ownerId = String(req.params.userId || '');
    const profile = await ensureProfile(ownerId);
    if (!profile) {
      response({
        res,
        statusCode: 404,
        success: false,
        message: 'User profile not found',
      });
      return;
    }

    const visibility = await photoVisibility({
      profile,
      viewerId: req.user._id,
    });
    const canDelete = visibility.ownerId === String(req.user._id || '');
    const photos = visibility.canSee ? await listProfilePhotos(ownerId) : [];

    response({
      res,
      payload: {
        matched: true,
        ownerId,
        canDelete,
        canSee: visibility.canSee,
        currentAvatar: visibility.currentAvatar,
        photos,
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

exports.resolvePhotoHistory = async (req, res) => {
  try {
    const url = String(req.query?.url || '').trim();
    if (!url) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Profile photo URL is required',
      });
      return;
    }

    const profile = await resolveProfileByPhotoUrl(url);
    if (!profile) {
      response({
        res,
        payload: {
          matched: false,
          ownerId: null,
          canDelete: false,
          canSee: false,
          currentAvatar: url,
          photos: [],
        },
      });
      return;
    }

    const visibility = await photoVisibility({
      profile,
      viewerId: req.user._id,
    });
    const canDelete = visibility.ownerId === String(req.user._id || '');
    const photos = visibility.canSee
      ? await listProfilePhotos(visibility.ownerId)
      : [];

    response({
      res,
      payload: {
        matched: true,
        ownerId: visibility.ownerId,
        canDelete,
        canSee: visibility.canSee,
        currentAvatar: visibility.currentAvatar,
        photos,
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

exports.deleteProfilePhoto = async (req, res) => {
  try {
    const result = await removeProfilePhoto({
      userId: req.user._id,
      photoId: req.params.photoId,
    });

    if (global?.io) {
      global.io.emit('profile/avatar-changed', {
        userId: req.user._id,
        at: new Date().toISOString(),
      });
    }

    response({
      res,
      message: 'Profile photo deleted',
      payload: {
        matched: true,
        ownerId: req.user._id,
        canDelete: true,
        canSee: true,
        currentAvatar: result.currentAvatar,
        photos: result.photos,
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

exports.commonGroups = async (req, res) => {
  try {
    const targetId = String(req.params.userId || '');
    const userId = String(req.user?._id || '');
    if (!targetId || !userId) throw new Error('Invalid user id');

    const groups = await GroupModel.findAll({
      attributes: ['_id', 'roomId', 'name', 'avatar', 'participantsId'],
    });

    const payload = groups
      .map((group) => toPlain(group))
      .filter((group) => {
        const participants = Array.isArray(group?.participantsId)
          ? group.participantsId
          : [];
        return participants.includes(userId) && participants.includes(targetId);
      })
      .map((group) => ({
        _id: group._id,
        roomId: group.roomId,
        name: group.name,
        avatar: toAbsoluteUploadUrl(group.avatar),
        totalParticipants: Array.isArray(group.participantsId)
          ? group.participantsId.length
          : 0,
      }));

    response({
      res,
      payload,
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
