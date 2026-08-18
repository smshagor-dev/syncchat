const crypto = require('crypto');
const NativePushDeviceModel = require('../db/models/nativePushDevice');
const response = require('../helpers/response');

const hashToken = (token) =>
  crypto.createHash('sha256').update(String(token || '')).digest('hex');

const normalizePlatform = (value) =>
  String(value || '').toLowerCase() === 'ios' ? 'ios' : 'android';

const normalizeProvider = (platform, value) => {
  const provider = String(value || '').toLowerCase();
  if (provider === 'fcm' || provider === 'apns') return provider;
  return platform === 'ios' ? 'apns' : 'fcm';
};

const normalizeTokenType = (platform, value) => {
  if (platform !== 'ios') return 'standard';
  return String(value || '').toLowerCase() === 'voip' ? 'voip' : 'standard';
};

exports.register = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token || token.length < 16) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'A valid native push token is required',
      });
      return;
    }

    const platform = normalizePlatform(req.body?.platform);
    const provider = normalizeProvider(platform, req.body?.provider);
    if ((platform === 'android' && provider !== 'fcm') || (platform === 'ios' && provider !== 'apns')) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Push provider does not match the selected platform',
      });
      return;
    }

    const tokenType = normalizeTokenType(platform, req.body?.tokenType);
    const tokenHash = hashToken(token);
    const existing = await NativePushDeviceModel.findOne({ where: { tokenHash } });
    const payload = {
      userId: req.user._id,
      platform,
      provider,
      token,
      tokenHash,
      tokenType,
      deviceId: String(req.body?.deviceId || '').trim().slice(0, 160),
      deviceLabel: String(req.body?.deviceLabel || '').trim().slice(0, 120),
      appVersion: String(req.body?.appVersion || '').trim().slice(0, 48),
      enabled: true,
      lastSeenAt: new Date(),
    };

    let row = existing;
    if (row) await row.update(payload);
    else row = await NativePushDeviceModel.create(payload);

    response({
      res,
      message: 'Native push device registered',
      payload: {
        _id: row._id,
        platform: row.platform,
        provider: row.provider,
        tokenType: row.tokenType,
        deviceId: row.deviceId,
        deviceLabel: row.deviceLabel,
        appVersion: row.appVersion,
        enabled: row.enabled,
        lastSeenAt: row.lastSeenAt,
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message || 'Unable to register native push device',
    });
  }
};

exports.unregister = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const deviceId = String(req.body?.deviceId || '').trim();
    if (!token && !deviceId) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'Push token or deviceId is required',
      });
      return;
    }

    const where = { userId: req.user._id };
    if (token) where.tokenHash = hashToken(token);
    else where.deviceId = deviceId;

    const rows = await NativePushDeviceModel.findAll({ where });
    await Promise.all(rows.map((row) => row.destroy()));

    response({
      res,
      message: 'Native push device unregistered',
      payload: { removed: rows.length },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message || 'Unable to unregister native push device',
    });
  }
};
