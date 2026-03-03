const SettingModel = require('../db/models/setting');
const { toPlain } = require('../db/utils');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const response = require('../helpers/response');

const getSafeSetting = (setting) => {
  const plain = toPlain(setting) || null;
  if (!plain) return null;

  delete plain.appLockHash;
  return plain;
};

const ensureSetting = async (userId) => {
  const [setting] = await SettingModel.findOrCreate({
    where: { userId },
    defaults: { userId },
  });
  return setting;
};

exports.find = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    response({
      res,
      payload: getSafeSetting(setting),
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

exports.update = async (req, res) => {
  try {
    const whitelist = [
      'dark',
      'enterToSend',
      'mute',
      'keepArchived',
      'sortContactByName',
      'blockedUserIds',
    ];
    const updates = Object.fromEntries(
      Object.entries(req.body || {}).filter(([key]) => whitelist.includes(key))
    );

    const [affectedRows] = await SettingModel.update(updates, {
      where: { userId: req.user._id },
    });

    response({
      res,
      message: 'Successfully updated account settings',
      payload: { affectedRows },
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

exports.setAppLock = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);
    const password = String(req.body?.password || '');

    if (password.length < 4) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Password must be at least 4 characters',
      });
      return;
    }

    await setting.update({
      appLockEnabled: true,
      appLockHash: encrypt(password),
    });

    response({
      res,
      message: 'App lock enabled',
      payload: getSafeSetting(setting),
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

exports.verifyAppLock = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);

    if (!setting.appLockEnabled) {
      response({
        res,
        message: 'App lock is disabled',
        payload: { verified: true, locked: false },
      });
      return;
    }

    const password = String(req.body?.password || '');
    if (!password) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Password is required',
      });
      return;
    }

    if (!setting.appLockHash) {
      response({
        res,
        statusCode: 500,
        success: false,
        message: 'App lock is misconfigured',
      });
      return;
    }

    decrypt(password, setting.appLockHash);

    response({
      res,
      message: 'App unlocked',
      payload: { verified: true, locked: true },
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

exports.changeAppLockPassword = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);

    if (!setting.appLockEnabled || !setting.appLockHash) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'App lock is not enabled',
      });
      return;
    }

    const oldPassword = String(req.body?.oldPassword || '');
    const newPassword = String(req.body?.newPassword || '');

    if (newPassword.length < 4) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'New password must be at least 4 characters',
      });
      return;
    }

    decrypt(oldPassword, setting.appLockHash);

    await setting.update({
      appLockHash: encrypt(newPassword),
    });

    response({
      res,
      message: 'App lock password updated',
      payload: getSafeSetting(setting),
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

exports.removeAppLock = async (req, res) => {
  try {
    const setting = await ensureSetting(req.user._id);

    if (!setting.appLockEnabled) {
      response({
        res,
        message: 'App lock already disabled',
        payload: getSafeSetting(setting),
      });
      return;
    }

    const password = String(req.body?.password || '');
    if (!password) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Password is required',
      });
      return;
    }

    if (!setting.appLockHash) {
      response({
        res,
        statusCode: 500,
        success: false,
        message: 'App lock is misconfigured',
      });
      return;
    }

    decrypt(password, setting.appLockHash);

    await setting.update({
      appLockEnabled: false,
      appLockHash: null,
    });

    response({
      res,
      message: 'App lock removed',
      payload: getSafeSetting(setting),
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
