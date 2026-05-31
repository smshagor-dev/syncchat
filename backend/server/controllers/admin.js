const crypto = require('crypto');
const os = require('os');
const { Op, fn, col } = require('sequelize');
const AdminModel = require('../db/models/admin');
const AdminRoleModel = require('../db/models/adminRole');
const AdminAccessKeyModel = require('../db/models/adminAccessKey');
const AdminSessionModel = require('../db/models/adminSession');
const AdminAuditLogModel = require('../db/models/adminAuditLog');
const AccountExportModel = require('../db/models/accountExport');
const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const SettingModel = require('../db/models/setting');
const UserSessionModel = require('../db/models/userSession');
const ContactModel = require('../db/models/contact');
const ContactLabelModel = require('../db/models/contactLabel');
const GroupModel = require('../db/models/group');
const ChannelModel = require('../db/models/channel');
const ChannelReviewModel = require('../db/models/channelReview');
const InboxModel = require('../db/models/inbox');
const ChatModel = require('../db/models/chat');
const FileModel = require('../db/models/file');
const DeviceLinkRequestModel = require('../db/models/deviceLinkRequest');
const PushSubscriptionModel = require('../db/models/pushSubscription');
const StatusModel = require('../db/models/status');
const ReportModel = require('../db/models/report');
const ModerationActionModel = require('../db/models/moderationAction');
const AdminModerationConfigModel = require('../db/models/adminModerationConfig');
const AdminContentConfigModel = require('../db/models/adminContentConfig');
const AdminSecurityConfigModel = require('../db/models/adminSecurityConfig');
const AdminAppConfigModel = require('../db/models/adminAppConfig');
const AccountEraseRequestModel = require('../db/models/accountEraseRequest');
const sequelize = require('../db/sequelize');
const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');
const response = require('../helpers/response');
const { toPlain, toPlainMany, asArray, addToSet, pullFromArray } = require('../db/utils');
const {
  ensureDefaultRoles,
  listPermissions,
  resolveRolePermissions,
  hasPermission,
  PERMISSIONS,
} = require('../helpers/adminPermissions');
const {
  createAdminSession,
  listSessions,
  revokeSession,
  signAdminToken,
} = require('../helpers/adminSessions');
const { logAdminAction } = require('../helpers/adminAudit');
const { normalizeGroupPermissions, getGroupPermissions } = require('../helpers/groupPermissions');
const { normalizeModerationSettings, getModerationSettings } = require('../helpers/moderation');
const { getGroupAdmins, addGroupAdmin, removeGroupAdmin } = require('../helpers/groupAdmins');
const { revokeSession: revokeUserSession } = require('../helpers/userSessions');
const { countRemainingRecoveryCodes } = require('../helpers/recoveryCodes');
const { sendSupportMessage } = require('../helpers/supportChat');
const {
  deleteLocalFileByUrl,
  parseDataUri,
  saveBufferFile,
  toAbsoluteUploadUrl,
} = require('../helpers/storage');
const { loadSecurityConfig, normalizeIp } = require('../helpers/securityConfig');
const { serializeSession } = require('../helpers/userSessions');
const { normalizeAppConfig, loadAppConfig, refreshAppConfigCache } = require('../helpers/appConfig');

const sanitizeAdmin = (admin) => {
  const plain = admin?.get ? admin.get({ plain: true }) : admin;
  if (!plain) return null;
  const payload = { ...plain };
  delete payload.password;
  payload.avatar = toAbsoluteUploadUrl(payload.avatar || null);
  return payload;
};

const sanitizeUser = (user) => {
  const plain = user?.get ? user.get({ plain: true }) : user;
  if (!plain) return null;
  const payload = { ...plain };
  delete payload.password;
  delete payload.otp;
  delete payload.resetOtp;
  delete payload.resetOtpExpires;
  delete payload.resetOtpVerified;
  return payload;
};

const buildProfileMap = (profiles = []) =>
  new Map(
    profiles.map((profile) => [
      profile.userId,
      {
        userId: profile.userId,
        fullname: profile.fullname || '',
        username: profile.username || '',
        avatar: toAbsoluteUploadUrl(profile.avatar || null),
      },
    ])
  );

const serializeChannelReview = (review, profileMap) => {
  const plain = review?.get ? review.get({ plain: true }) : review;
  if (!plain) return null;
  return {
    _id: plain._id,
    channelId: plain.channelId,
    userId: plain.userId,
    rating: plain.rating,
    review: plain.review || '',
    status: plain.status || 'visible',
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    profile: profileMap.get(plain.userId) || null,
  };
};

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const resolveAvatarExtension = (mime = '') => {
  if (/png/i.test(mime)) return 'png';
  if (/jpe?g/i.test(mime)) return 'jpg';
  if (/webp/i.test(mime)) return 'webp';
  if (/gif/i.test(mime)) return 'gif';
  return 'png';
};

const processAdminAvatar = async ({ avatar, adminId, previousAvatar }) => {
  if (!avatar) return previousAvatar || null;
  if (!String(avatar).startsWith('data:')) {
    throw createError(400, 'Avatar must be an uploaded image');
  }

  const { mime, buffer } = parseDataUri(String(avatar));
  const ext = resolveAvatarExtension(mime);
  const filename = `admin-${adminId}-${Date.now()}.${ext}`;
  const uploaded = await saveBufferFile({
    buffer,
    folder: 'admin-avatars',
    filename,
  });

  if (previousAvatar) {
    await deleteLocalFileByUrl(previousAvatar);
  }

  return uploaded.publicPath;
};

const processAppLogo = async ({ logo, previousLogo }) => {
  if (!logo) return previousLogo || '';
  if (!String(logo).startsWith('data:')) {
    throw createError(400, 'Logo must be an uploaded image');
  }

  const { mime, buffer } = parseDataUri(String(logo));
  const ext = resolveAvatarExtension(mime);
  const filename = `app-logo-${Date.now()}.${ext}`;
  const uploaded = await saveBufferFile({
    buffer,
    folder: 'app-brand',
    filename,
  });

  if (previousLogo) {
    await deleteLocalFileByUrl(previousLogo);
  }

  return uploaded.publicPath;
};

const processAppSeoImage = async ({ image, previousImage }) => {
  if (!image) return previousImage || '';
  if (!String(image).startsWith('data:')) {
    throw createError(400, 'SEO image must be an uploaded image');
  }

  const { mime, buffer } = parseDataUri(String(image));
  const ext = resolveAvatarExtension(mime);
  const filename = `app-seo-${Date.now()}.${ext}`;
  const uploaded = await saveBufferFile({
    buffer,
    folder: 'app-brand',
    filename,
  });

  if (previousImage) {
    await deleteLocalFileByUrl(previousImage);
  }

  return uploaded.publicPath;
};

const ensureAdminRoleFor = async (admin) => {
  if (admin.roleId) return admin.roleId;
  const role = await AdminRoleModel.findOne({ where: { name: admin.role || 'super-admin' } });
  if (!role) return null;
  await admin.update({ roleId: role._id });
  return role._id;
};

exports.bootstrap = async (req, res) => {
  try {
    await ensureDefaultRoles();
    const count = await AdminModel.count();
    response({
      res,
      payload: { hasAdmin: count > 0 },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.register = async (req, res) => {
  try {
    const count = await AdminModel.count();
    if (count > 0) {
      throw createError(403, 'Admin registration is disabled');
    }

    await ensureDefaultRoles();

    const fullname = String(req.body.fullname || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const avatar = String(req.body.avatar || '').trim();
    const password = String(req.body.password || '');

    if (!fullname || fullname.length < 2) {
      throw createError(400, 'Full name is required');
    }
    if (!email) {
      throw createError(400, 'Email is required');
    }
    if (!password || password.length < 6) {
      throw createError(400, 'Password must be at least 6 characters');
    }

    const existing = await AdminModel.findOne({ where: { email } });
    if (existing) {
      throw createError(409, 'Email already registered');
    }

    const superRole = await AdminRoleModel.findOne({ where: { name: 'super-admin' } });

    const admin = await AdminModel.create({
      fullname,
      email,
      password: encrypt(password),
      role: 'super-admin',
      roleId: superRole?._id || null,
    });

    if (avatar) {
      const storedAvatar = await processAdminAvatar({
        avatar,
        adminId: admin._id,
        previousAvatar: null,
      });
      await admin.update({ avatar: storedAvatar });
    }

    const session = await createAdminSession({ adminId: admin._id, req });
    await admin.update({ lastLoginAt: new Date() });

    await logAdminAction({
      req,
      adminId: admin._id,
      action: 'admin.register',
      entityType: 'admin',
      entityId: admin._id,
    });

    response({
      res,
      statusCode: 201,
      message: 'Admin account created',
      payload: {
        admin: sanitizeAdmin(admin),
        token: signAdminToken({ adminId: admin._id, sessionId: session._id, role: admin.role }),
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

exports.login = async (req, res) => {
  try {
    await ensureDefaultRoles();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      throw createError(400, 'Email and password are required');
    }

    const admin = await AdminModel.findOne({ where: { email } });

    if (!admin) {
      throw createError(401, 'Email not registered');
    }

    if (!admin.active) {
      throw createError(403, 'Admin account is disabled');
    }

    try {
      decrypt(password, admin.password);
    } catch (error0) {
      throw createError(401, 'Invalid password');
    }

    await ensureAdminRoleFor(admin);
    const session = await createAdminSession({ adminId: admin._id, req });
    await admin.update({ lastLoginAt: new Date() });

    await logAdminAction({
      req,
      adminId: admin._id,
      action: 'admin.login',
      entityType: 'admin',
      entityId: admin._id,
    });

    response({
      res,
      message: 'Admin login successful',
      payload: {
        admin: sanitizeAdmin(admin),
        token: signAdminToken({ adminId: admin._id, sessionId: session._id, role: admin.role }),
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

exports.logout = async (req, res) => {
  try {
    if (req.adminSession) {
      await revokeSession({ session: req.adminSession, reason: 'logout' });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'admin.logout',
      entityType: 'admin',
      entityId: req.admin?._id,
    });

    response({
      res,
      message: 'Logged out successfully',
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.me = async (req, res) => {
  try {
    const admin = await AdminModel.findOne({ where: { _id: req.admin?._id } });
    if (!admin) throw createError(404, 'Admin not found');

    const permissions = await resolveRolePermissions({
      roleId: admin.roleId,
      roleName: admin.role,
    });

    response({
      res,
      payload: {
        ...sanitizeAdmin(admin),
        permissions,
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

exports.updateProfile = async (req, res) => {
  try {
    const admin = await AdminModel.findOne({ where: { _id: req.admin?._id } });
    if (!admin) throw createError(404, 'Admin not found');

    const fullname = String(req.body.fullname || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const avatar = String(req.body.avatar || '').trim();

    if (fullname && fullname.length < 2) {
      throw createError(400, 'Full name is too short');
    }
    if (email && !email.includes('@')) {
      throw createError(400, 'Email is invalid');
    }

    let nextAvatar = admin.avatar || null;
    if (avatar) {
      nextAvatar = await processAdminAvatar({
        avatar,
        adminId: admin._id,
        previousAvatar: admin.avatar || null,
      });
    }

    const next = {
      fullname: fullname || admin.fullname,
      email: email || admin.email,
      avatar: nextAvatar,
    };

    if (email && email !== admin.email) {
      const existing = await AdminModel.findOne({ where: { email } });
      if (existing) throw createError(409, 'Email already registered');
    }

    await admin.update(next);

    await logAdminAction({
      req,
      adminId: admin._id,
      action: 'admin.profile.update',
      entityType: 'admin',
      entityId: admin._id,
    });

    response({
      res,
      message: 'Admin profile updated',
      payload: sanitizeAdmin(admin),
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

exports.listRoles = async (req, res) => {
  try {
    const roles = await AdminRoleModel.findAll({ order: [['name', 'ASC']] });
    response({
      res,
      payload: roles,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.listPermissions = async (req, res) => {
  response({
    res,
    payload: listPermissions(),
  });
};

exports.createRole = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().toLowerCase();
    const description = String(req.body.description || '').trim();
    const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : [];

    if (!name) throw createError(400, 'Role name is required');

    const exists = await AdminRoleModel.findOne({ where: { name } });
    if (exists) throw createError(409, 'Role already exists');

    const role = await AdminRoleModel.create({
      name,
      description: description || null,
      permissions,
      isSystem: false,
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'role.create',
      entityType: 'admin_role',
      entityId: role._id,
      metadata: { name, permissions },
    });

    response({
      res,
      statusCode: 201,
      message: 'Role created',
      payload: role,
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

exports.updateRole = async (req, res) => {
  try {
    const roleId = String(req.params.id || '').trim();
    const role = await AdminRoleModel.findOne({ where: { _id: roleId } });
    if (!role) throw createError(404, 'Role not found');
    if (role.isSystem) throw createError(403, 'System roles cannot be edited');

    const name = String(req.body.name || role.name).trim().toLowerCase();
    const description = String(req.body.description || role.description || '').trim();
    const permissions = Array.isArray(req.body.permissions) ? req.body.permissions : role.permissions;

    await role.update({
      name,
      description: description || null,
      permissions,
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'role.update',
      entityType: 'admin_role',
      entityId: role._id,
      metadata: { name, permissions },
    });

    response({
      res,
      message: 'Role updated',
      payload: role,
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

exports.listAdmins = async (req, res) => {
  try {
    const admins = await AdminModel.findAll({ order: [['createdAt', 'DESC']] });
    response({
      res,
      payload: admins.map((admin) => sanitizeAdmin(admin)),
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    await ensureDefaultRoles();
    const fullname = String(req.body.fullname || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const avatar = String(req.body.avatar || '').trim();
    const roleId = String(req.body.roleId || '').trim();
    const roleName = String(req.body.role || '').trim();

    if (!fullname || fullname.length < 2) {
      throw createError(400, 'Full name is required');
    }
    if (!email) {
      throw createError(400, 'Email is required');
    }
    if (!password || password.length < 6) {
      throw createError(400, 'Password must be at least 6 characters');
    }

    const existing = await AdminModel.findOne({ where: { email } });
    if (existing) throw createError(409, 'Email already registered');

    let role = null;
    if (roleId) {
      role = await AdminRoleModel.findOne({ where: { _id: roleId } });
    } else if (roleName) {
      role = await AdminRoleModel.findOne({ where: { name: roleName } });
    }

    if (!role) {
      role = await AdminRoleModel.findOne({ where: { name: 'moderator' } });
    }

    const admin = await AdminModel.create({
      fullname,
      email,
      password: encrypt(password),
      role: role?.name || 'moderator',
      roleId: role?._id || null,
    });

    if (avatar) {
      const storedAvatar = await processAdminAvatar({
        avatar,
        adminId: admin._id,
        previousAvatar: null,
      });
      await admin.update({ avatar: storedAvatar });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'admin.create',
      entityType: 'admin',
      entityId: admin._id,
    });

    response({
      res,
      statusCode: 201,
      message: 'Admin created',
      payload: sanitizeAdmin(admin),
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

exports.updateAdminRole = async (req, res) => {
  try {
    const adminId = String(req.params.id || '').trim();
    const roleId = String(req.body.roleId || '').trim();
    const roleName = String(req.body.role || '').trim();

    const admin = await AdminModel.findOne({ where: { _id: adminId } });
    if (!admin) throw createError(404, 'Admin not found');

    let role = null;
    if (roleId) {
      role = await AdminRoleModel.findOne({ where: { _id: roleId } });
    } else if (roleName) {
      role = await AdminRoleModel.findOne({ where: { name: roleName } });
    }

    if (!role) throw createError(404, 'Role not found');

    await admin.update({ roleId: role._id, role: role.name });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'admin.role.update',
      entityType: 'admin',
      entityId: admin._id,
      metadata: { role: role.name },
    });

    response({
      res,
      message: 'Admin role updated',
      payload: sanitizeAdmin(admin),
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

exports.listSessions = async (req, res) => {
  try {
    const sessions = await listSessions({
      adminId: req.admin._id,
      currentSessionId: req.adminSession?._id || null,
    });

    response({
      res,
      payload: sessions,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const session = await AdminSessionModel.findOne({
      where: { _id: sessionId, adminId: req.admin._id },
    });
    if (!session) throw createError(404, 'Session not found');

    await revokeSession({ session, reason: 'manual' });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'admin.session.revoke',
      entityType: 'admin_session',
      entityId: session._id,
    });

    response({
      res,
      message: 'Session revoked',
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

exports.listAccessKeys = async (req, res) => {
  try {
    const keys = await AdminAccessKeyModel.findAll({
      where: { adminId: req.admin._id },
      order: [['createdAt', 'DESC']],
    });

    const payload = keys.map((key) => ({
      _id: key._id,
      label: key.label,
      active: key.active,
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    }));

    response({
      res,
      payload,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.createAccessKey = async (req, res) => {
  try {
    const label = String(req.body.label || '').trim();
    if (!label) throw createError(400, 'Key label is required');

    const rawKey = crypto.randomBytes(32).toString('hex');
    const keyHash = encrypt(rawKey);

    const entry = await AdminAccessKeyModel.create({
      adminId: req.admin._id,
      label,
      keyHash,
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'admin.access_key.create',
      entityType: 'admin_access_key',
      entityId: entry._id,
      metadata: { label },
    });

    response({
      res,
      statusCode: 201,
      message: 'Access key created',
      payload: {
        _id: entry._id,
        label: entry.label,
        key: rawKey,
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

exports.revokeAccessKey = async (req, res) => {
  try {
    const keyId = String(req.params.id || '').trim();
    const entry = await AdminAccessKeyModel.findOne({
      where: { _id: keyId, adminId: req.admin._id },
    });
    if (!entry) throw createError(404, 'Access key not found');

    await entry.update({ active: false });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'admin.access_key.revoke',
      entityType: 'admin_access_key',
      entityId: entry._id,
    });

    response({
      res,
      message: 'Access key revoked',
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

exports.listAuditLogs = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const logs = await AdminAuditLogModel.findAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    response({
      res,
      payload: logs,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.checkPermission = async (req, res) => {
  const needed = Array.isArray(req.body?.permissions)
    ? req.body.permissions
    : String(req.body?.permission || '').trim();

  const ok = hasPermission({ permissions: req.adminPermissions || [], needed });

  response({
    res,
    payload: { allowed: ok },
  });
};




const revokeAllUserSessions = async ({ userId, reason }) => {
  const sessions = await UserSessionModel.findAll({
    where: { userId, revokedAt: null },
  });
  await Promise.all(
    sessions.map((session) => revokeUserSession({ session, reason }))
  );
  return sessions.length;
};

const normalizeUserStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['active', 'blocked', 'banned', 'deleted'].includes(normalized) ? normalized : null;
};

const resolveLastSeenFilter = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'any') return { mode: 'any' };
  if (normalized === 'online' || normalized === 'offline') {
    return { mode: normalized };
  }
  if (normalized === 'never') return { mode: 'never' };
  const match = normalized.match(/^(\d+)(d)?$/);
  if (match) {
    const days = Number(match[1]);
    if (!Number.isNaN(days) && days > 0) {
      return { mode: 'since', cutoff: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }
  }
  return { mode: 'any' };
};

exports.listUsers = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const q = String(req.query.q || req.query.query || '').trim();
    const status = normalizeUserStatus(req.query.status);
    const verifiedParam = String(req.query.verified || '').trim().toLowerCase();
    const lastSeenFilter = resolveLastSeenFilter(req.query.lastSeen);

    const where = {};
    if (q) {
      where[Op.or] = [
        { username: { [Op.like]: `%${q}%` } },
        { fullname: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
      ];
    }
    if (status) where.status = status;
    if (verifiedParam === 'true' || verifiedParam === 'false') {
      where.verified = verifiedParam === 'true';
    }

    const users = await UserModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const userIds = users.map((user) => user._id);
    const profiles = userIds.length
      ? await ProfileModel.findAll({
          where: { userId: { [Op.in]: userIds } },
          attributes: ['userId', 'avatar', 'online', 'bio', 'phone', 'fullname', 'username'],
        })
      : [];
    const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));

    const sessions = userIds.length
      ? await UserSessionModel.findAll({
          attributes: ['userId', [fn('MAX', col('lastSeenAt')), 'lastSeenAt']],
          where: { userId: { [Op.in]: userIds } },
          group: ['userId'],
        })
      : [];
    const lastSeenByUserId = new Map(
      sessions.map((row) => [row.userId, row.get('lastSeenAt')])
    );

    let rows = users.map((user) => {
      const profile = profileByUserId.get(user._id);
      return {
        ...sanitizeUser(user),
        avatar: toAbsoluteUploadUrl(profile?.avatar || null),
        online: !!profile?.online,
        lastSeenAt: lastSeenByUserId.get(user._id) || null,
      };
    });

    if (lastSeenFilter.mode === 'online') {
      rows = rows.filter((row) => row.online);
    } else if (lastSeenFilter.mode === 'offline') {
      rows = rows.filter((row) => !row.online);
    } else if (lastSeenFilter.mode === 'never') {
      rows = rows.filter((row) => !row.lastSeenAt);
    } else if (lastSeenFilter.mode === 'since' && lastSeenFilter.cutoff) {
      rows = rows.filter(
        (row) => row.lastSeenAt && new Date(row.lastSeenAt) >= lastSeenFilter.cutoff
      );
    }

    response({
      res,
      payload: {
        users: rows,
        total: rows.length,
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.getUser = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    const profile = await ProfileModel.findOne({ where: { userId } });
    const setting = await SettingModel.findOne({ where: { userId } });
    const sessions = await UserSessionModel.findAll({
      where: { userId },
      order: [['lastSeenAt', 'DESC']],
      limit: 6,
    });

    const lastSeenAt = sessions.length
      ? sessions.reduce((max, row) => {
          const value = row.lastSeenAt ? new Date(row.lastSeenAt).getTime() : 0;
          return value > max ? value : max;
        }, 0)
      : 0;

    const activeSessions = await UserSessionModel.count({
      where: { userId, revokedAt: null },
    });
    const totalSessions = await UserSessionModel.count({ where: { userId } });

    const latestExport = await AccountExportModel.findOne({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });

    response({
      res,
      payload: {
        user: sanitizeUser(user),
        profile: profile
          ? {
              ...toPlain(profile),
              avatar: toAbsoluteUploadUrl(profile.avatar || null),
            }
          : null,
        settings: setting
          ? {
              twoFactorEnabled: !!setting.twoFactorEnabled,
              twoFactorRecoveryRemaining: countRemainingRecoveryCodes(
                Array.isArray(setting.twoFactorRecoveryCodes)
                  ? setting.twoFactorRecoveryCodes
                  : []
              ),
              twoFactorRecoveryGeneratedAt: setting.twoFactorRecoveryGeneratedAt || null,
              twoFactorRecoveryRevokedAt: setting.twoFactorRecoveryRevokedAt || null,
            }
          : null,
        activity: {
          lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
          activeSessions,
          totalSessions,
        },
        latestExport: latestExport
          ? {
              _id: latestExport._id,
              requestedAt: latestExport.requestedAt,
              expiresAt: latestExport.expiresAt,
              deliveredAt: latestExport.deliveredAt,
              fileUrl: latestExport.fileUrl,
            }
          : null,
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

exports.blockUser = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    await user.update({ status: 'blocked', blockedAt: new Date() });
    const revokedCount = await revokeAllUserSessions({
      userId,
      reason: 'admin-block',
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'user.block',
      entityType: 'user',
      entityId: userId,
      metadata: { revokedSessions: revokedCount },
    });

    response({
      res,
      message: 'User blocked',
      payload: { user: sanitizeUser(user), revokedSessions: revokedCount },
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

exports.unblockUser = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    await user.update({ status: 'active', blockedAt: null });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'user.unblock',
      entityType: 'user',
      entityId: userId,
    });

    response({
      res,
      message: 'User unblocked',
      payload: { user: sanitizeUser(user) },
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

exports.banUser = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    await user.update({ status: 'banned', bannedAt: new Date() });
    const revokedCount = await revokeAllUserSessions({
      userId,
      reason: 'admin-ban',
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'user.ban',
      entityType: 'user',
      entityId: userId,
      metadata: { revokedSessions: revokedCount },
    });

    response({
      res,
      message: 'User banned',
      payload: { user: sanitizeUser(user), revokedSessions: revokedCount },
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

exports.unbanUser = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    await user.update({ status: 'active', bannedAt: null });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'user.unban',
      entityType: 'user',
      entityId: userId,
    });

    response({
      res,
      message: 'User unbanned',
      payload: { user: sanitizeUser(user) },
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

exports.forceLogoutUser = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    const revokedCount = await revokeAllUserSessions({
      userId,
      reason: 'admin-force-logout',
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'user.force_logout',
      entityType: 'user',
      entityId: userId,
      metadata: { revokedSessions: revokedCount },
    });

    response({
      res,
      message: revokedCount > 0 ? 'User sessions revoked' : 'No active sessions',
      payload: { revokedSessions: revokedCount },
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

exports.resetUserTwoFactor = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    const [setting] = await SettingModel.findOrCreate({
      where: { userId },
      defaults: { userId },
    });

    await setting.update({
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: [],
      twoFactorRecoveryGeneratedAt: null,
      twoFactorRecoveryRevokedAt: new Date(),
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'user.2fa.reset',
      entityType: 'user',
      entityId: userId,
    });

    response({
      res,
      message: 'Two-factor authentication reset',
      payload: {
        twoFactorEnabled: false,
        twoFactorRecoveryRemaining: 0,
        twoFactorRecoveryRevokedAt: setting.twoFactorRecoveryRevokedAt,
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

exports.deleteUser = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const mode = String(req.query.mode || req.body?.mode || 'soft')
      .trim()
      .toLowerCase();

    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    if (mode === 'hard') {
      await UserModel.destroy({ where: { _id: userId } });
      await ProfileModel.destroy({ where: { userId } });
      await SettingModel.destroy({ where: { userId } });
      await ContactModel.destroy({ where: { userId } });
      await ContactLabelModel.destroy({ where: { userId } });
      await UserSessionModel.destroy({ where: { userId } });
      await AccountExportModel.destroy({ where: { userId } });
      await DeviceLinkRequestModel.destroy({ where: { userId } });
      await PushSubscriptionModel.destroy({ where: { userId } });
      await StatusModel.destroy({ where: { userId } });

      const groups = await GroupModel.findAll();
      await Promise.all(
        groups.map(async (group) => {
          const participants = asArray(group.participantsId);
          const admins = asArray(group.adminsId);
          const pending = asArray(group.pendingMembersId);
          if (
            !participants.includes(userId) &&
            !admins.includes(userId) &&
            !pending.includes(userId) &&
            group.adminId !== userId
          ) {
            return;
          }

          const nextParticipants = pullFromArray(participants, [userId]);
          const nextAdmins = pullFromArray(admins, [userId]);
          const nextPending = pullFromArray(pending, [userId]);
          const next = {
            participantsId: nextParticipants,
            adminsId: nextAdmins,
            pendingMembersId: nextPending,
          };

          if (group.adminId === userId && nextAdmins.length > 0) {
            next.adminId = nextAdmins[0];
          } else if (group.adminId === userId && nextParticipants.length > 0) {
            next.adminId = nextParticipants[0];
          }

          await group.update(next);
        })
      );

      await logAdminAction({
        req,
        adminId: req.admin?._id,
        action: 'user.delete.hard',
        entityType: 'user',
        entityId: userId,
      });

      response({
        res,
        message: 'User deleted permanently',
        payload: { userId },
      });
      return;
    }

    await user.update({ status: 'deleted', deletedAt: new Date() });
    const revokedCount = await revokeAllUserSessions({
      userId,
      reason: 'admin-soft-delete',
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'user.delete.soft',
      entityType: 'user',
      entityId: userId,
      metadata: { revokedSessions: revokedCount },
    });

    response({
      res,
      message: 'User soft deleted',
      payload: { user: sanitizeUser(user), revokedSessions: revokedCount },
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

exports.listAccountExports = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const status = String(req.query.status || '').trim().toLowerCase();
    const now = new Date();

    const where = {};
    if (status === 'pending') {
      where.deliveredAt = null;
      where.expiresAt = { [Op.gt]: now };
    } else if (status === 'delivered') {
      where.deliveredAt = { [Op.ne]: null };
    } else if (status === 'expired') {
      where.expiresAt = { [Op.lte]: now };
    }

    const rows = await AccountExportModel.findAll({
      where,
      order: [['requestedAt', 'DESC']],
      limit,
      offset,
    });

    const userIds = rows.map((row) => row.userId);
    const users = userIds.length
      ? await UserModel.findAll({
          where: { _id: { [Op.in]: userIds } },
          attributes: ['_id', 'username', 'fullname', 'email', 'status'],
        })
      : [];
    const userById = new Map(users.map((user) => [user._id, user]));

    const payload = rows.map((row) => {
      const user = userById.get(row.userId);
      return {
        _id: row._id,
        userId: row.userId,
        fileUrl: row.fileUrl,
        requestedAt: row.requestedAt,
        expiresAt: row.expiresAt,
        deliveredAt: row.deliveredAt,
        user: user ? sanitizeUser(user) : null,
      };
    });

    response({
      res,
      payload: { exports: payload, total: payload.length },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.markAccountExportDelivered = async (req, res) => {
  try {
    const exportId = String(req.params.id || '').trim();
    const row = await AccountExportModel.findOne({ where: { _id: exportId } });
    if (!row) throw createError(404, 'Export request not found');

    await row.update({ deliveredAt: new Date() });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'account_export.delivered',
      entityType: 'account_export',
      entityId: row._id,
    });

    response({
      res,
      message: 'Export marked as delivered',
      payload: {
        _id: row._id,
        deliveredAt: row.deliveredAt,
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



const sanitizeGroup = (group) => {
  const plain = toPlain(group);
  if (!plain) return null;
  delete plain.passwordHash;
  return {
    ...plain,
    avatar: toAbsoluteUploadUrl(plain.avatar || null),
    permissions: getGroupPermissions(plain),
    moderation: getModerationSettings(plain),
    adminsId: getGroupAdmins(plain),
  };
};

const resolveGroupStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['active', 'banned', 'deleted'].includes(normalized) ? normalized : null;
};

exports.listGroups = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const q = String(req.query.q || req.query.query || '').trim();
    const status = resolveGroupStatus(req.query.status);
    const accessType = ['public', 'private'].includes(String(req.query.accessType || ''))
      ? String(req.query.accessType)
      : null;

    const where = { isChannel: false };
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { roomId: { [Op.like]: `%${q}%` } },
        { link: { [Op.like]: `%${q}%` } },
      ];
    }
    if (status) where.status = status;
    if (accessType) where.accessType = accessType;

    const rows = await GroupModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const payload = rows.map((row) => {
      const plain = sanitizeGroup(row);
      return {
        ...plain,
        memberCount: Array.isArray(plain.participantsId) ? plain.participantsId.length : 0,
        adminCount: Array.isArray(plain.adminsId) ? plain.adminsId.length : 0,
        pendingCount: Array.isArray(plain.pendingMembersId) ? plain.pendingMembersId.length : 0,
      };
    });

    response({
      res,
      payload: { groups: payload, total: payload.length },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.getGroup = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const plain = sanitizeGroup(group);
    const participantIds = Array.isArray(plain.participantsId) ? plain.participantsId : [];
    const adminIds = Array.isArray(plain.adminsId) ? plain.adminsId : [];
    const pendingIds = Array.isArray(plain.pendingMembersId) ? plain.pendingMembersId : [];

    const profiles = await ProfileModel.findAll({
      where: { userId: { [Op.in]: [...new Set([...participantIds, ...adminIds, ...pendingIds])] } },
      attributes: ['userId', 'fullname', 'avatar', 'bio', 'username'],
    });
    const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));

    const mapProfile = (userId) => {
      const profile = profileMap.get(userId);
      return profile
        ? {
            ...toPlain(profile),
            avatar: toAbsoluteUploadUrl(profile.avatar || null),
          }
        : { userId };
    };

    response({
      res,
      payload: {
        group: plain,
        members: participantIds.map(mapProfile),
        admins: adminIds.map(mapProfile),
        pending: pendingIds.map(mapProfile),
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

exports.updateGroup = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const name = String(req.body?.name || group.name).trim();
    const desc = String(req.body?.desc || group.desc || '').trim();
    const accessType = req.body?.accessType === 'private' ? 'private' : 'public';
    const password = String(req.body?.password || '');

    if (!name || name.length < 2) throw createError(400, 'Group name is required');

    const updates = {
      name,
      desc,
      accessType,
    };

    if (accessType === 'private') {
      if (password && password.length < 4) {
        throw createError(400, 'Private group password must be at least 4 characters');
      }
      if (password) {
        updates.passwordHash = encrypt(password);
      } else if (!group.passwordHash) {
        throw createError(400, 'Private group password must be set');
      }
    } else {
      updates.passwordHash = null;
    }

    await group.update(updates);

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.update',
      entityType: 'group',
      entityId: groupId,
    });

    response({
      res,
      message: 'Group updated',
      payload: sanitizeGroup(group),
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

exports.updateGroupPermissions = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const nextPermissions = normalizeGroupPermissions(req.body?.permissions, {
      isChannel: group.isChannel,
    });
    await group.update({ permissions: nextPermissions });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.permissions.update',
      entityType: 'group',
      entityId: groupId,
    });

    response({
      res,
      message: 'Group permissions updated',
      payload: { permissions: nextPermissions },
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

exports.updateGroupModeration = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const nextModeration = normalizeModerationSettings(req.body?.moderation);
    await group.update({ moderation: nextModeration });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.moderation.update',
      entityType: 'group',
      entityId: groupId,
    });

    response({
      res,
      message: 'Group moderation updated',
      payload: { moderation: nextModeration },
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

exports.promoteGroupAdmin = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const participants = asArray(group.participantsId);
    if (!participants.includes(userId)) throw createError(400, 'User is not a member');

    const nextAdmins = addGroupAdmin({ group, userId });
    await group.update({ adminsId: nextAdmins, adminId: nextAdmins[0] || group.adminId });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.admin.promote',
      entityType: 'group',
      entityId: groupId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Admin promoted',
      payload: { adminsId: nextAdmins },
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

exports.demoteGroupAdmin = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const currentAdmins = getGroupAdmins(group);
    if (currentAdmins.length <= 1 && currentAdmins.includes(userId)) {
      throw createError(400, 'At least one admin is required');
    }

    const nextAdmins = removeGroupAdmin({ group, userId });
    const nextAdminId = nextAdmins[0] || group.adminId;

    await group.update({ adminsId: nextAdmins, adminId: nextAdminId });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.admin.demote',
      entityType: 'group',
      entityId: groupId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Admin demoted',
      payload: { adminsId: nextAdmins },
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

exports.removeGroupMember = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const nextParticipants = pullFromArray(group.participantsId, [userId]);
    const nextAdmins = pullFromArray(getGroupAdmins(group), [userId]);
    const nextPending = pullFromArray(group.pendingMembersId, [userId]);
    const nextAdminId = nextAdmins[0] || group.adminId;

    await group.update({
      participantsId: nextParticipants,
      adminsId: nextAdmins,
      pendingMembersId: nextPending,
      adminId: nextAdminId,
    });

    const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
    if (inbox) {
      await inbox.update({ ownersId: pullFromArray(inbox.ownersId, [userId]) });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.member.remove',
      entityType: 'group',
      entityId: groupId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Member removed',
      payload: {
        participantsId: nextParticipants,
        adminsId: nextAdmins,
        pendingMembersId: nextPending,
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

exports.approveGroupMember = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const pending = asArray(group.pendingMembersId);
    if (!pending.includes(userId)) throw createError(404, 'Join request not found');

    const nextParticipants = addToSet(group.participantsId, [userId]);
    const nextPending = pullFromArray(pending, [userId]);
    await group.update({ participantsId: nextParticipants, pendingMembersId: nextPending });

    const inbox = await InboxModel.findOne({ where: { roomId: group.roomId } });
    if (inbox) {
      await inbox.update({ ownersId: addToSet(inbox.ownersId, [userId]) });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.member.approve',
      entityType: 'group',
      entityId: groupId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Member approved',
      payload: { participantsId: nextParticipants, pendingMembersId: nextPending },
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

exports.rejectGroupMember = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    const pending = asArray(group.pendingMembersId);
    if (!pending.includes(userId)) throw createError(404, 'Join request not found');

    const nextPending = pullFromArray(pending, [userId]);
    await group.update({ pendingMembersId: nextPending });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.member.reject',
      entityType: 'group',
      entityId: groupId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Member rejected',
      payload: { pendingMembersId: nextPending },
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

exports.banGroup = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    await group.update({ status: 'banned', bannedAt: new Date() });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.ban',
      entityType: 'group',
      entityId: groupId,
    });

    response({
      res,
      message: 'Group banned',
      payload: sanitizeGroup(group),
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

exports.unbanGroup = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    await group.update({ status: 'active', bannedAt: null });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.unban',
      entityType: 'group',
      entityId: groupId,
    });

    response({
      res,
      message: 'Group unbanned',
      payload: sanitizeGroup(group),
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

exports.deleteGroup = async (req, res) => {
  try {
    const groupId = String(req.params.id || '').trim();
    const mode = String(req.query.mode || req.body?.mode || 'soft').trim().toLowerCase();
    const group = await GroupModel.findOne({ where: { _id: groupId } });
    if (!group) throw createError(404, 'Group not found');

    if (mode === 'hard') {
      await ChatModel.destroy({ where: { roomId: group.roomId } });
      await InboxModel.destroy({ where: { roomId: group.roomId } });
      await group.destroy();

      await logAdminAction({
        req,
        adminId: req.admin?._id,
        action: 'group.delete.hard',
        entityType: 'group',
        entityId: groupId,
      });

      response({ res, message: 'Group deleted permanently', payload: { groupId } });
      return;
    }

    await group.update({ status: 'deleted', deletedAt: new Date() });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'group.delete.soft',
      entityType: 'group',
      entityId: groupId,
    });

    response({ res, message: 'Group deleted', payload: sanitizeGroup(group) });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};



const sanitizeChannel = (channel) => {
  const plain = toPlain(channel);
  if (!plain) return null;
  delete plain.passwordHash;
  return {
    ...plain,
    avatar: toAbsoluteUploadUrl(plain.avatar || null),
    permissions: getGroupPermissions(plain),
    moderation: getModerationSettings(plain),
    adminsId: getGroupAdmins(plain),
  };
};

const resolveChannelStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['active', 'banned', 'deleted'].includes(normalized) ? normalized : null;
};

exports.listChannels = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const q = String(req.query.q || req.query.query || '').trim();
    const status = resolveChannelStatus(req.query.status);
    const accessType = ['public', 'private'].includes(String(req.query.accessType || ''))
      ? String(req.query.accessType)
      : null;

    const where = {};
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { roomId: { [Op.like]: `%${q}%` } },
        { link: { [Op.like]: `%${q}%` } },
      ];
    }
    if (status) where.status = status;
    if (accessType) where.accessType = accessType;

    const rows = await ChannelModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const payload = rows.map((row) => {
      const plain = sanitizeChannel(row);
      return {
        ...plain,
        subscriberCount: Array.isArray(plain.participantsId)
          ? plain.participantsId.length
          : 0,
        adminCount: Array.isArray(plain.adminsId) ? plain.adminsId.length : 0,
        pendingCount: Array.isArray(plain.pendingMembersId)
          ? plain.pendingMembersId.length
          : 0,
      };
    });

    response({
      res,
      payload: { channels: payload, total: payload.length },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.getChannel = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const plain = sanitizeChannel(channel);
    const participantIds = Array.isArray(plain.participantsId) ? plain.participantsId : [];
    const adminIds = Array.isArray(plain.adminsId) ? plain.adminsId : [];
    const pendingIds = Array.isArray(plain.pendingMembersId) ? plain.pendingMembersId : [];

    const profiles = await ProfileModel.findAll({
      where: { userId: { [Op.in]: [...new Set([...participantIds, ...adminIds, ...pendingIds])] } },
      attributes: ['userId', 'fullname', 'avatar', 'bio', 'username'],
    });
    const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));

    const mapProfile = (userId) => {
      const profile = profileMap.get(userId);
      return profile
        ? {
            ...toPlain(profile),
            avatar: toAbsoluteUploadUrl(profile.avatar || null),
          }
        : { userId };
    };

    response({
      res,
      payload: {
        channel: plain,
        subscribers: participantIds.map(mapProfile),
        admins: adminIds.map(mapProfile),
        pending: pendingIds.map(mapProfile),
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

exports.updateChannel = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const name = String(req.body?.name || channel.name).trim();
    const desc = String(req.body?.desc || channel.desc || '').trim();
    const accessType = req.body?.accessType === 'private' ? 'private' : 'public';
    const password = String(req.body?.password || '');

    if (!name || name.length < 2) throw createError(400, 'Channel name is required');

    const updates = {
      name,
      desc,
      accessType,
    };

    if (accessType === 'private') {
      if (password && password.length < 4) {
        throw createError(400, 'Private channel password must be at least 4 characters');
      }
      if (password) {
        updates.passwordHash = encrypt(password);
      } else if (!channel.passwordHash) {
        throw createError(400, 'Private channel password must be set');
      }
    } else {
      updates.passwordHash = null;
    }

    await channel.update(updates);

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.update',
      entityType: 'channel',
      entityId: channelId,
    });

    response({
      res,
      message: 'Channel updated',
      payload: sanitizeChannel(channel),
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

exports.updateChannelPermissions = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const nextPermissions = normalizeGroupPermissions(req.body?.permissions, {
      isChannel: true,
    });
    await channel.update({ permissions: nextPermissions });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.permissions.update',
      entityType: 'channel',
      entityId: channelId,
    });

    response({
      res,
      message: 'Channel permissions updated',
      payload: { permissions: nextPermissions },
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

exports.updateChannelModeration = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const nextModeration = normalizeModerationSettings(req.body?.moderation);
    await channel.update({ moderation: nextModeration });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.moderation.update',
      entityType: 'channel',
      entityId: channelId,
    });

    response({
      res,
      message: 'Channel moderation updated',
      payload: { moderation: nextModeration },
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

exports.promoteChannelAdmin = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const participants = asArray(channel.participantsId);
    if (!participants.includes(userId)) throw createError(400, 'User is not a subscriber');

    const nextAdmins = addGroupAdmin({ group: channel, userId });
    await channel.update({ adminsId: nextAdmins, adminId: nextAdmins[0] || channel.adminId });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.admin.promote',
      entityType: 'channel',
      entityId: channelId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Admin promoted',
      payload: { adminsId: nextAdmins },
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

exports.demoteChannelAdmin = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const currentAdmins = getGroupAdmins(channel);
    if (currentAdmins.length <= 1 && currentAdmins.includes(userId)) {
      throw createError(400, 'At least one admin is required');
    }

    const nextAdmins = removeGroupAdmin({ group: channel, userId });
    const nextAdminId = nextAdmins[0] || channel.adminId;

    await channel.update({ adminsId: nextAdmins, adminId: nextAdminId });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.admin.demote',
      entityType: 'channel',
      entityId: channelId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Admin demoted',
      payload: { adminsId: nextAdmins },
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

exports.removeChannelSubscriber = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const nextParticipants = pullFromArray(channel.participantsId, [userId]);
    const nextAdmins = pullFromArray(getGroupAdmins(channel), [userId]);
    const nextPending = pullFromArray(channel.pendingMembersId, [userId]);
    const nextAdminId = nextAdmins[0] || channel.adminId;

    await channel.update({
      participantsId: nextParticipants,
      adminsId: nextAdmins,
      pendingMembersId: nextPending,
      adminId: nextAdminId,
    });

    const inbox = await InboxModel.findOne({ where: { roomId: channel.roomId } });
    if (inbox) {
      await inbox.update({ ownersId: pullFromArray(inbox.ownersId, [userId]) });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.subscriber.remove',
      entityType: 'channel',
      entityId: channelId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Subscriber removed',
      payload: {
        participantsId: nextParticipants,
        adminsId: nextAdmins,
        pendingMembersId: nextPending,
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

exports.approveChannelSubscriber = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const pending = asArray(channel.pendingMembersId);
    if (!pending.includes(userId)) throw createError(404, 'Join request not found');

    const nextParticipants = addToSet(channel.participantsId, [userId]);
    const nextPending = pullFromArray(pending, [userId]);
    await channel.update({ participantsId: nextParticipants, pendingMembersId: nextPending });

    const inbox = await InboxModel.findOne({ where: { roomId: channel.roomId } });
    if (inbox) {
      await inbox.update({ ownersId: addToSet(inbox.ownersId, [userId]) });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.subscriber.approve',
      entityType: 'channel',
      entityId: channelId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Subscriber approved',
      payload: { participantsId: nextParticipants, pendingMembersId: nextPending },
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

exports.rejectChannelSubscriber = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const userId = String(req.body?.userId || '').trim();
    if (!userId) throw createError(400, 'User ID is required');

    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const pending = asArray(channel.pendingMembersId);
    if (!pending.includes(userId)) throw createError(404, 'Join request not found');

    const nextPending = pullFromArray(pending, [userId]);
    await channel.update({ pendingMembersId: nextPending });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.subscriber.reject',
      entityType: 'channel',
      entityId: channelId,
      metadata: { userId },
    });

    response({
      res,
      message: 'Subscriber rejected',
      payload: { pendingMembersId: nextPending },
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

exports.banChannel = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    await channel.update({ status: 'banned', bannedAt: new Date() });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.ban',
      entityType: 'channel',
      entityId: channelId,
    });

    response({
      res,
      message: 'Channel banned',
      payload: sanitizeChannel(channel),
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

exports.unbanChannel = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    await channel.update({ status: 'active', bannedAt: null });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.unban',
      entityType: 'channel',
      entityId: channelId,
    });

    response({
      res,
      message: 'Channel unbanned',
      payload: sanitizeChannel(channel),
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

exports.deleteChannel = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const mode = String(req.query.mode || req.body?.mode || 'soft').trim().toLowerCase();
    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    if (mode === 'hard') {
      await ChatModel.destroy({ where: { roomId: channel.roomId } });
      await InboxModel.destroy({ where: { roomId: channel.roomId } });
      await channel.destroy();

      await logAdminAction({
        req,
        adminId: req.admin?._id,
        action: 'channel.delete.hard',
        entityType: 'channel',
        entityId: channelId,
      });

      response({ res, message: 'Channel deleted permanently', payload: { channelId } });
      return;
    }

    await channel.update({ status: 'deleted', deletedAt: new Date() });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'channel.delete.soft',
      entityType: 'channel',
      entityId: channelId,
    });

    response({ res, message: 'Channel deleted', payload: sanitizeChannel(channel) });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};


const normalizeGlobalWordList = (value) =>
  [...new Set(
    asArray(value)
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  )];

const normalizeGlobalMediaTypes = (value) =>
  [...new Set(
    asArray(value)
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => ['image', 'video', 'audio', 'document'].includes(item))
  )];

const normalizeSlowModePresets = (value) =>
  [...new Set(
    asArray(value)
      .map((item) => Math.max(0, Math.min(3600, Number(item) || 0)))
      .filter((item) => Number.isFinite(item))
  )].sort((a, b) => a - b);

const resolveModerationRoom = async (roomId) => {
  const [group, channel] = await Promise.all([
    GroupModel.findOne({ where: { roomId } }),
    ChannelModel.findOne({ where: { roomId } }),
  ]);
  return group || channel || null;
};

const upsertMutedUser = ({ mutedUsers = [], userId, expiresAt }) => {
  const entries = asArray(mutedUsers).filter(Boolean);
  const next = entries.filter((item) => String(item.userId || item.id) !== String(userId));
  next.push({ userId, expiresAt: expiresAt || null });
  return next;
};

exports.getModerationConfig = async (req, res) => {
  try {
    const [row] = await AdminModerationConfigModel.findOrCreate({
      where: {},
      defaults: {
        bannedWords: [],
        blockedMediaTypes: [],
        slowModePresets: [0, 10, 30, 60, 120],
        autoReportViolations: true,
      },
    });

    response({
      res,
      payload: row,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.listChannelReviews = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const statusFilter = String(req.query.status || 'visible').trim().toLowerCase();
    const skip = Math.max(0, Number(req.query.skip || 0));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));

    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const where = { channelId };
    if (statusFilter === 'visible') where.status = 'visible';
    if (statusFilter === 'hidden') where.status = 'hidden';

    const [rows, visibleStats, totalCount] = await Promise.all([
      ChannelReviewModel.findAll({
        where,
        order: [['createdAt', 'DESC']],
        offset: skip,
        limit,
      }),
      ChannelReviewModel.findOne({
        where: { channelId, status: 'visible' },
        attributes: [[fn('AVG', col('rating')), 'avg'], [fn('COUNT', col('*')), 'count']],
        raw: true,
      }),
      ChannelReviewModel.count({ where: { channelId } }),
    ]);

    const reviewerIds = [...new Set(rows.map((row) => row.userId))];
    const profiles = reviewerIds.length
      ? await ProfileModel.findAll({
          where: { userId: { [Op.in]: reviewerIds } },
          attributes: ['userId', 'fullname', 'username', 'avatar'],
        })
      : [];
    const profileMap = buildProfileMap(toPlainMany(profiles));

    response({
      res,
      payload: {
        channelId,
        stats: {
          ratingAvg: Number(visibleStats?.avg || 0),
          ratingCount: Number(visibleStats?.count || 0),
        },
        total: totalCount,
        reviews: rows
          .map((row) => serializeChannelReview(row, profileMap))
          .filter(Boolean),
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

exports.updateChannelReview = async (req, res) => {
  try {
    const channelId = String(req.params.id || '').trim();
    const reviewId = String(req.params.reviewId || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();

    const channel = await ChannelModel.findOne({ where: { _id: channelId } });
    if (!channel) throw createError(404, 'Channel not found');

    const review = await ChannelReviewModel.findOne({
      where: { _id: reviewId, channelId },
    });
    if (!review) throw createError(404, 'Review not found');

    if (action === 'delete') {
      await review.destroy();
      await logAdminAction({
        req,
        adminId: req.admin?._id,
        action: 'channel.review.delete',
        entityType: 'channel_review',
        entityId: reviewId,
      });
      response({ res, message: 'Review deleted', payload: { reviewId } });
      return;
    }

    const nextStatus = action === 'show' ? 'visible' : 'hidden';
    await review.update({ status: nextStatus });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: `channel.review.${nextStatus}`,
      entityType: 'channel_review',
      entityId: reviewId,
    });

    response({
      res,
      message: 'Review updated',
      payload: { reviewId, status: nextStatus },
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

exports.updateModerationConfig = async (req, res) => {
  try {
    const [row] = await AdminModerationConfigModel.findOrCreate({
      where: {},
      defaults: {
        bannedWords: [],
        blockedMediaTypes: [],
        slowModePresets: [0, 10, 30, 60, 120],
        autoReportViolations: true,
      },
    });

    const bannedWords = normalizeGlobalWordList(req.body?.bannedWords || []);
    const blockedMediaTypes = normalizeGlobalMediaTypes(req.body?.blockedMediaTypes || []);
    const slowModePresets = normalizeSlowModePresets(req.body?.slowModePresets || []);
    const autoReportViolations = req.body?.autoReportViolations !== false;

    await row.update({
      bannedWords,
      blockedMediaTypes,
      slowModePresets: slowModePresets.length ? slowModePresets : [0, 10, 30, 60, 120],
      autoReportViolations,
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'moderation.config.update',
      entityType: 'moderation_config',
      entityId: row._id,
    });

    response({
      res,
      message: 'Moderation config updated',
      payload: row,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.listReports = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 50), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const status = String(req.query.status || '').trim();
    const roomType = String(req.query.roomType || '').trim();
    const source = String(req.query.source || '').trim();

    const where = {};
    if (['open', 'resolved', 'dismissed'].includes(status)) where.status = status;
    if (['private', 'group'].includes(roomType)) where.roomType = roomType;
    if (['user', 'auto'].includes(source)) where.source = source;

    const reports = await ReportModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const reportIds = reports.map((report) => report._id);
    const actions = reportIds.length
      ? await ModerationActionModel.findAll({
          where: { reportId: { [Op.in]: reportIds } },
          order: [['createdAt', 'ASC']],
        })
      : [];
    const actionMap = actions.reduce((acc, action) => {
      const key = action.reportId || 'unknown';
      const prev = acc.get(key) || [];
      acc.set(key, [...prev, action]);
      return acc;
    }, new Map());

    const profileIds = [
      ...new Set(
        reports
          .flatMap((item) => [item.reporterId, item.reportedUserId, item.reviewedBy])
          .filter(Boolean)
      ),
    ];

    const profiles = profileIds.length
      ? await ProfileModel.findAll({
          where: { userId: profileIds },
          attributes: ['userId', 'fullname', 'avatar', 'username'],
        })
      : [];
    const profileMap = new Map(
      profiles.map((profile) => [profile.userId, {
        ...toPlain(profile),
        avatar: toAbsoluteUploadUrl(profile.avatar || null),
      }])
    );

    const reportedIds = [
      ...new Set(reports.map((item) => item.reportedUserId).filter(Boolean)),
    ];
    const reportedUsers = reportedIds.length
      ? await UserModel.findAll({
          where: { _id: reportedIds },
          attributes: ['_id', 'status'],
        })
      : [];
    const reportedStatusMap = new Map(
      reportedUsers.map((user) => [user._id, user.status])
    );

    const roomIds = [
      ...new Set(reports.map((item) => item.roomId).filter(Boolean)),
    ];
    const [groups, channels] = await Promise.all([
      roomIds.length
        ? GroupModel.findAll({
            where: { roomId: { [Op.in]: roomIds } },
            attributes: ['_id', 'roomId', 'name', 'avatar', 'status'],
          })
        : [],
      roomIds.length
        ? ChannelModel.findAll({
            where: { roomId: { [Op.in]: roomIds } },
            attributes: ['_id', 'roomId', 'name', 'avatar', 'status'],
          })
        : [],
    ]);
    const groupMap = new Map(
      groups.map((group) => [
        group.roomId,
        {
          _id: group._id,
          roomId: group.roomId,
          name: group.name,
          avatar: toAbsoluteUploadUrl(group.avatar || null),
          status: group.status || 'active',
        },
      ])
    );
    const channelMap = new Map(
      channels.map((channel) => [
        channel.roomId,
        {
          _id: channel._id,
          roomId: channel.roomId,
          name: channel.name,
          avatar: toAbsoluteUploadUrl(channel.avatar || null),
          status: channel.status || 'active',
        },
      ])
    );

    response({
      res,
      payload: reports.map((report) => ({
        ...toPlain(report),
        reporter: report.reporterId ? profileMap.get(report.reporterId) || null : null,
        reportedUser: report.reportedUserId
          ? {
              ...(profileMap.get(report.reportedUserId) || {}),
              status: reportedStatusMap.get(report.reportedUserId) || null,
            }
          : null,
        reviewer: report.reviewedBy ? profileMap.get(report.reviewedBy) || null : null,
        actions: actionMap.get(report._id) || [],
        roomEntity: channelMap.get(report.roomId)
          ? { type: 'channel', ...channelMap.get(report.roomId) }
          : groupMap.get(report.roomId)
            ? { type: 'group', ...groupMap.get(report.roomId) }
            : null,
        kind: report.chatId
          ? 'chat'
          : report.roomType === 'private'
            ? 'contact'
            : channelMap.get(report.roomId)
              ? 'channel'
              : 'group',
      })),
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.actOnReport = async (req, res) => {
  try {
    const reportId = String(req.params.id || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim().slice(0, 500);
    const durationMinutes = Number(req.body?.durationMinutes || 60);

    const report = await ReportModel.findOne({ where: { _id: reportId } });
    if (!report) throw createError(404, 'Report not found');

    let actionMeta = {};

    if (action === 'warn') {
      if (report.reportedUserId) {
        await sendSupportMessage({
          userId: report.reportedUserId,
          text: note || 'You have received a warning from SyncChat moderation.',
        });
      }
    }

    if (action === 'mute') {
      if (!report.roomId || !report.reportedUserId) {
        throw createError(400, 'Room or user is missing for mute action');
      }
      const room = await resolveModerationRoom(report.roomId);
      if (!room) throw createError(404, 'Room not found');

      const expiresAt = durationMinutes > 0
        ? new Date(Date.now() + durationMinutes * 60 * 1000)
        : null;
      const nextMuted = upsertMutedUser({
        mutedUsers: room.mutedUserIds,
        userId: report.reportedUserId,
        expiresAt,
      });
      await room.update({ mutedUserIds: nextMuted });
      actionMeta = { expiresAt, durationMinutes };
    }

    if (action === 'ban') {
      if (!report.reportedUserId) throw createError(400, 'Reported user is missing');
      const user = await UserModel.findOne({ where: { _id: report.reportedUserId } });
      if (user) {
        await user.update({ status: 'banned', bannedAt: new Date() });
        await revokeAllUserSessions({
          userId: user._id,
          reason: 'admin-ban',
        });
      }
    }

    if (action === 'delete_content') {
      if (!report.chatId) throw createError(400, 'Report has no chat content');
      await ChatModel.destroy({ where: { _id: report.chatId } });
    }

    const nextStatus = ['resolve', 'resolved', 'dismiss', 'dismissed'].includes(action)
      ? action.startsWith('dismiss')
        ? 'dismissed'
        : 'resolved'
      : 'resolved';

    await report.update({
      status: nextStatus,
      resolutionNote: note || report.resolutionNote || null,
      reviewedBy: req.admin?._id || null,
      reviewedAt: new Date(),
    });

    await ModerationActionModel.create({
      reportId: report._id,
      actionType: action || 'resolve',
      actorAdminId: req.admin?._id,
      targetUserId: report.reportedUserId || null,
      roomId: report.roomId || null,
      chatId: report.chatId || null,
      notes: note || null,
      metadata: actionMeta,
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: `report.action.${action || 'resolve'}`,
      entityType: 'report',
      entityId: report._id,
    });

    response({
      res,
      message: 'Report action completed',
      payload: toPlain(report),
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

exports.listModerationActions = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 200);
    const actions = await ModerationActionModel.findAll({
      order: [['createdAt', 'DESC']],
      limit,
    });
    response({ res, payload: actions });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

const POLL_PREFIX = '__poll__::';
const normalizePreviewDomains = (value) =>
  [...new Set(
    asArray(value)
      .map((item) => String(item || '').trim().toLowerCase())
      .map((item) => {
        if (!item) return '';
        try {
          if (item.startsWith('http://') || item.startsWith('https://')) {
            return new URL(item).hostname.toLowerCase();
          }
        } catch (error0) {
          // ignore parse errors
        }
        const trimmed = item.replace(/^https?:\/\//, '');
        return trimmed.split('/')[0].split('?')[0].split('#')[0];
      })
      .map((item) => item.replace(/^www\./, '').trim())
      .filter(Boolean)
  )];

const normalizePinnedMessages = (value) =>
  asArray(value)
    .map((item) => ({
      chatId: String(item?.chatId || '').trim(),
      pinnedBy: String(item?.pinnedBy || '').trim(),
      pinnedAt: item?.pinnedAt || new Date().toISOString(),
    }))
    .filter((item) => item.chatId);

const normalizePinHistory = (value) =>
  asArray(value)
    .map((item) => ({
      chatId: String(item?.chatId || '').trim(),
      action: item?.action === 'unpin' ? 'unpin' : 'pin',
      actorId: String(item?.actorId || '').trim(),
      at: item?.at || new Date().toISOString(),
    }))
    .filter((item) => item.chatId);

const emitPinsUpdate = async (roomId) => {
  if (!roomId || !global.io) return;
  global.io.to(roomId).emit('chat/pins', { roomId });
  const inbox = await InboxModel.findOne({ where: { roomId } });
  if (inbox) {
    global.io
      .to(asArray(toPlain(inbox)?.ownersId))
      .emit('chat/pins', { roomId });
  }
};

const getFileCleanupUrls = (file) =>
  [
    file?.url,
    file?.thumbnailUrl,
    file?.streamUrl,
    file?.streamHdUrl,
  ].filter(Boolean);

const parsePollFromText = (text) => {
  const raw = String(text || '');
  if (!raw.startsWith(POLL_PREFIX)) return null;
  try {
    return JSON.parse(raw.replace(POLL_PREFIX, ''));
  } catch (error0) {
    return null;
  }
};

const normalizeIpList = (value) =>
  [...new Set(
    asArray(value)
      .map((item) => normalizeIp(item))
      .filter(Boolean)
  )];

const normalizeRateLimits = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const windowSeconds = Math.max(10, Math.min(3600, Number(source.windowSeconds) || 60));
  const maxRequests = Math.max(10, Math.min(5000, Number(source.maxRequests) || 120));
  return {
    enabled: source.enabled === true,
    windowSeconds,
    maxRequests,
  };
};

exports.getSecurityConfig = async (req, res) => {
  try {
    const [row] = await AdminSecurityConfigModel.findOrCreate({
      where: {},
      defaults: {
        blockedIps: [],
        blockedFingerprints: [],
        rateLimits: { enabled: false, windowSeconds: 60, maxRequests: 120 },
      },
    });

    response({
      res,
      payload: {
        blockedIps: asArray(row?.blockedIps).filter(Boolean),
        blockedFingerprints: asArray(row?.blockedFingerprints).filter(Boolean),
        rateLimits: row?.rateLimits || { enabled: false, windowSeconds: 60, maxRequests: 120 },
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.updateSecurityConfig = async (req, res) => {
  try {
    const [row] = await AdminSecurityConfigModel.findOrCreate({
      where: {},
      defaults: {
        blockedIps: [],
        blockedFingerprints: [],
        rateLimits: { enabled: false, windowSeconds: 60, maxRequests: 120 },
      },
    });

    const blockedIps = normalizeIpList(req.body?.blockedIps || []);
    const blockedFingerprints = asArray(req.body?.blockedFingerprints || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    const rateLimits = normalizeRateLimits(req.body?.rateLimits || {});

    await row.update({ blockedIps, blockedFingerprints, rateLimits });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'security.config.update',
      entityType: 'security_config',
      entityId: row._id,
    });

    response({
      res,
      message: 'Security config updated',
      payload: { blockedIps, blockedFingerprints, rateLimits },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.getAppConfig = async (req, res) => {
  try {
    const config = await loadAppConfig();
    response({
      res,
      payload: {
        ...config,
        appLogo: toAbsoluteUploadUrl(config.appLogo || ''),
        seo: {
          ...(config.seo || {}),
          image: toAbsoluteUploadUrl(config.seo?.image || ''),
        },
        smtp: {
          ...config.smtp,
          pass: config.smtp?.pass ? '******' : '',
          passSet: Boolean(config.smtp?.pass),
        },
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

const ANALYTICS_CACHE_TTL_MS = 60 * 1000;
const ANALYTICS_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
let analyticsCache = {
  payload: null,
  fetchedAt: 0,
  inflight: null,
};

const countDistinctSessions = async ({ since, onlyActive = true }) => {
  const where = {
    lastSeenAt: { [Op.gte]: since },
  };
  if (onlyActive) where.revokedAt = null;
  const rows = await UserSessionModel.findAll({
    where,
    attributes: ['userId'],
    group: ['userId'],
  });
  return rows.length;
};

const sumFileSize = async ({ fileIds = null } = {}) => {
  const where = fileIds && fileIds.length > 0 ? { fileId: { [Op.in]: fileIds } } : undefined;
  const row = await FileModel.findOne({
    where,
    attributes: [[fn('SUM', col('size')), 'totalSize']],
    raw: true,
  });
  const total = Number(row?.totalSize || 0);
  return Number.isFinite(total) ? total : 0;
};

const getDistinctFileIdsSince = async (since) => {
  const rows = await ChatModel.findAll({
    where: {
      fileId: { [Op.not]: null },
      createdAt: { [Op.gte]: since },
    },
    attributes: ['fileId'],
    group: ['fileId'],
  });
  return rows.map((row) => row.fileId).filter(Boolean);
};

const buildDayLabels = (days = 7) => {
  const labels = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    labels.push(date.toISOString().slice(0, 10));
  }
  return labels;
};

const getDailyCounts = async ({ model, where, dateField = 'createdAt', days = 7 }) => {
  const rows = await model.findAll({
    where,
    attributes: [[fn('DATE', col(dateField)), 'day'], [fn('COUNT', col('*')), 'count']],
    group: [fn('DATE', col(dateField))],
    raw: true,
  });
  const map = new Map(
    rows.map((row) => [String(row.day || '').slice(0, 10), Number(row.count || 0)])
  );
  const labels = buildDayLabels(days);
  return labels.map((label) => map.get(label) || 0);
};

const computeAnalyticsSummary = async () => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const since24 = new Date(now - dayMs);
    const since7 = new Date(now - 7 * dayMs);
    const since30 = new Date(now - 30 * dayMs);

    const [files7dIds, files30dIds] = await Promise.all([
      getDistinctFileIdsSince(since7),
      getDistinctFileIdsSince(since30),
    ]);

    const [
      totalUsers,
      newUsers7d,
      newUsers30d,
      activeUsers24h,
      activeUsers7d,
      totalMessages,
      messages7d,
      totalFiles,
      totalStorageBytes,
      totalReports,
      openReports,
      reviewedReports7d,
      audioTotal,
      videoTotal,
    ] = await Promise.all([
      UserModel.count(),
      UserModel.count({ where: { createdAt: { [Op.gte]: since7 } } }),
      UserModel.count({ where: { createdAt: { [Op.gte]: since30 } } }),
      countDistinctSessions({ since: since24 }),
      countDistinctSessions({ since: since7 }),
      ChatModel.count(),
      ChatModel.count({ where: { createdAt: { [Op.gte]: since7 } } }),
      FileModel.count(),
      sumFileSize(),
      ReportModel.count(),
      ReportModel.count({ where: { status: 'open' } }),
      ReportModel.count({ where: { reviewedAt: { [Op.gte]: since7 } } }),
      FileModel.count({ where: { type: 'audio' } }),
      FileModel.count({ where: { type: 'video' } }),
    ]);

    const files7d = files7dIds.length;
    const storage30dBytes = await sumFileSize({ fileIds: files30dIds });

    let audio7d = 0;
    let video7d = 0;
    if (files7dIds.length > 0) {
      const [audioCount, videoCount] = await Promise.all([
        FileModel.count({ where: { fileId: { [Op.in]: files7dIds }, type: 'audio' } }),
        FileModel.count({ where: { fileId: { [Op.in]: files7dIds }, type: 'video' } }),
      ]);
      audio7d = audioCount;
      video7d = videoCount;
    }

    const reviewedRows = await ReportModel.findAll({
      where: {
        reviewedAt: { [Op.not]: null, [Op.gte]: since30 },
      },
      attributes: ['createdAt', 'reviewedAt'],
    });
    const reviewedPlain = toPlainMany(reviewedRows);
    const resolutionDurations = reviewedPlain
      .map((item) => {
        const start = new Date(item.createdAt || 0).getTime();
        const end = new Date(item.reviewedAt || 0).getTime();
        const diff = end - start;
        return Number.isFinite(diff) && diff > 0 ? diff : 0;
      })
      .filter((val) => val > 0);
    const avgResolutionMs =
      resolutionDurations.length > 0
        ? Math.round(
            resolutionDurations.reduce((sum, val) => sum + val, 0) /
              resolutionDurations.length
          )
        : 0;

    const memory = process.memoryUsage();
    const uptimeSeconds = Math.round(process.uptime());

    const labels = buildDayLabels(7);
    const [newUsersSeries, messagesSeries, uploadsSeries, reportsSeries] =
      await Promise.all([
        getDailyCounts({
          model: UserModel,
          where: { createdAt: { [Op.gte]: since7 } },
          days: 7,
        }),
        getDailyCounts({
          model: ChatModel,
          where: { createdAt: { [Op.gte]: since7 } },
          days: 7,
        }),
        getDailyCounts({
          model: ChatModel,
          where: { createdAt: { [Op.gte]: since7 }, fileId: { [Op.not]: null } },
          days: 7,
        }),
        getDailyCounts({
          model: ReportModel,
          where: { createdAt: { [Op.gte]: since7 } },
          days: 7,
        }),
      ]);

    return {
      users: {
        total: totalUsers,
        new7d: newUsers7d,
        new30d: newUsers30d,
        active24h: activeUsers24h,
        active7d: activeUsers7d,
      },
      messages: {
        total: totalMessages,
        last7d: messages7d,
      },
      media: {
        audioTotal,
        audio7d,
        videoTotal,
        video7d,
        filesTotal: totalFiles,
        files7d,
      },
      storage: {
        bytesTotal: totalStorageBytes,
        bytes30d: storage30dBytes,
      },
      reports: {
        total: totalReports,
        open: openReports,
        reviewed7d: reviewedReports7d,
        avgResolutionMs,
      },
      system: {
        node: process.version,
        env: process.env.NODE_ENV || 'development',
        uptimeSeconds,
        load: os.loadavg(),
        memory: {
          rss: memory.rss,
          heapTotal: memory.heapTotal,
          heapUsed: memory.heapUsed,
        },
        db: {
          name: sequelize.getDatabaseName(),
        },
        time: new Date().toISOString(),
      },
      series: {
        labels,
        newUsers: newUsersSeries,
        messages: messagesSeries,
        uploads: uploadsSeries,
        reports: reportsSeries,
      },
    };
};

const parseDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.toISOString().slice(0, 10));
};

const buildRangeLabels = (start, end) => {
  const labels = [];
  const cursor = new Date(start);
  const endDate = new Date(end);
  while (cursor <= endDate) {
    labels.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
};

const getDailyCountsRange = async ({ model, where, dateField = 'createdAt', labels = [] }) => {
  const rows = await model.findAll({
    where,
    attributes: [[fn('DATE', col(dateField)), 'day'], [fn('COUNT', col('*')), 'count']],
    group: [fn('DATE', col(dateField))],
    raw: true,
  });
  const map = new Map(
    rows.map((row) => [String(row.day || '').slice(0, 10), Number(row.count || 0)])
  );
  return labels.map((label) => map.get(label) || 0);
};

exports.getAnalyticsRange = async (req, res) => {
  try {
    const startRaw = String(req.query.start || '').trim();
    const endRaw = String(req.query.end || '').trim();
    const start = parseDateOnly(startRaw);
    const end = parseDateOnly(endRaw);

    if (!start || !end) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: 'start and end dates are required',
      });
      return;
    }

    const maxDays = 90;
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (diffDays <= 0 || diffDays > maxDays) {
      response({
        res,
        statusCode: 400,
        success: false,
        message: `Date range must be between 1 and ${maxDays} days`,
      });
      return;
    }

    const labels = buildRangeLabels(start, end);
    const whereRange = { createdAt: { [Op.between]: [start, new Date(end.getTime() + 86399999)] } };

    const [newUsers, messages, uploads, reports, reportStatusRows] = await Promise.all([
      getDailyCountsRange({ model: UserModel, where: whereRange, labels }),
      getDailyCountsRange({ model: ChatModel, where: whereRange, labels }),
      getDailyCountsRange({
        model: ChatModel,
        where: { ...whereRange, fileId: { [Op.not]: null } },
        labels,
      }),
      getDailyCountsRange({ model: ReportModel, where: whereRange, labels }),
      ReportModel.findAll({
        where: whereRange,
        attributes: ['status'],
        raw: true,
      }),
    ]);

    const statusCounts = reportStatusRows.reduce((acc, row) => {
      const key = row.status || 'open';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    response({
      res,
      payload: {
        labels,
        series: {
          newUsers,
          messages,
          uploads,
          reports,
        },
        reportStatus: statusCounts,
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

const buildAnalyticsPayload = (payload) => ({
  ...(payload || {}),
  refreshedAt: analyticsCache.fetchedAt
    ? new Date(analyticsCache.fetchedAt).toISOString()
    : null,
});

const refreshAnalyticsCache = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && analyticsCache.payload && now - analyticsCache.fetchedAt < ANALYTICS_CACHE_TTL_MS) {
    return analyticsCache.payload;
  }
  if (analyticsCache.inflight) return analyticsCache.inflight;

  analyticsCache.inflight = computeAnalyticsSummary()
    .then((payload) => {
      analyticsCache.payload = payload;
      analyticsCache.fetchedAt = Date.now();
      const enriched = buildAnalyticsPayload(payload);
      if (global.io?.to) {
        global.io.to('admin:analytics').emit('admin/analytics', enriched);
      }
      return payload;
    })
    .finally(() => {
      analyticsCache.inflight = null;
    });

  return analyticsCache.inflight;
};

setInterval(() => {
  refreshAnalyticsCache({ force: true }).catch(() => {});
}, ANALYTICS_REFRESH_INTERVAL_MS);

exports.getAnalyticsSummary = async (req, res) => {
  try {
    const force = String(req.query.force || '') === '1';
    const payload = await refreshAnalyticsCache({ force });
    response({
      res,
      payload: buildAnalyticsPayload(payload),
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.getAnalyticsSnapshot = async ({ force = false } = {}) =>
  buildAnalyticsPayload(await refreshAnalyticsCache({ force }));

exports.restartServer = async (req, res) => {
  try {
    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'system.restart',
      entityType: 'system',
      entityId: 'server',
    });

    response({
      res,
      message: 'Server restart triggered',
    });

    setTimeout(() => {
      process.exit(0);
    }, 500);
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.updateAppConfig = async (req, res) => {
  try {
    const [row] = await AdminAppConfigModel.findOrCreate({
      where: {},
      defaults: {},
    });

    const current = await loadAppConfig();
    const incoming = req.body || {};
    const previousLogo = current.appLogo || '';
    let nextLogo = previousLogo;
    const hasLogoField = typeof incoming.appLogo === 'string';
    const trimmedLogo = hasLogoField ? incoming.appLogo.trim() : '';
    if (hasLogoField && trimmedLogo === '') {
      if (previousLogo) {
        await deleteLocalFileByUrl(previousLogo);
      }
      nextLogo = '';
    } else if (hasLogoField && trimmedLogo) {
      nextLogo = await processAppLogo({ logo: incoming.appLogo, previousLogo });
    }
    const previousSeoImage = current.seo?.image || '';
    let nextSeoImage = previousSeoImage;
    const hasSeoImageField = typeof incoming?.seo?.image === 'string';
    const trimmedSeoImage = hasSeoImageField ? incoming.seo.image.trim() : '';
    if (hasSeoImageField && trimmedSeoImage === '') {
      if (previousSeoImage) {
        await deleteLocalFileByUrl(previousSeoImage);
      }
      nextSeoImage = '';
    } else if (hasSeoImageField && trimmedSeoImage) {
      nextSeoImage = await processAppSeoImage({
        image: incoming.seo.image,
        previousImage: previousSeoImage,
      });
    }

    const merged = normalizeAppConfig(
      {
        ...current,
        ...incoming,
        appLogo: nextLogo,
        seo: {
          ...current.seo,
          ...(incoming.seo || {}),
          image: nextSeoImage,
        },
        smtp: {
          ...current.smtp,
          ...(incoming.smtp || {}),
          pass:
            incoming?.smtp?.pass === ''
              ? ''
              : incoming?.smtp?.pass !== undefined
                ? incoming.smtp.pass
                : current.smtp?.pass || '',
        },
        featureFlags: {
          ...current.featureFlags,
          ...(incoming.featureFlags || {}),
        },
        defaultPrivacy: {
          ...current.defaultPrivacy,
          ...(incoming.defaultPrivacy || {}),
        },
        defaultChat: {
          ...current.defaultChat,
          ...(incoming.defaultChat || {}),
        },
        defaultNotifications: {
          ...current.defaultNotifications,
          ...(incoming.defaultNotifications || {}),
        },
        uploadLimits: {
          ...current.uploadLimits,
          ...(incoming.uploadLimits || {}),
        },
        mediaProfile: {
          ...current.mediaProfile,
          ...(incoming.mediaProfile || {}),
        },
        maintenance: {
          ...current.maintenance,
          ...(incoming.maintenance || {}),
        },
      },
      current
    );

    await row.update({
      appName: merged.appName,
      appLogo: merged.appLogo,
      supportEmail: merged.supportEmail,
      smtp: merged.smtp,
      featureFlags: merged.featureFlags,
      defaultPrivacy: merged.defaultPrivacy,
      defaultChat: merged.defaultChat,
      defaultNotifications: merged.defaultNotifications,
      uploadLimits: merged.uploadLimits,
      mediaProfile: merged.mediaProfile,
      maintenance: merged.maintenance,
      seo: merged.seo,
    });

    refreshAppConfigCache();

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'app_config.update',
      entityType: 'app_config',
      entityId: row._id,
    });

    response({
      res,
      message: 'App config updated',
      payload: {
        ...merged,
        appLogo: toAbsoluteUploadUrl(merged.appLogo || ''),
        seo: {
          ...merged.seo,
          image: toAbsoluteUploadUrl(merged.seo?.image || ''),
        },
        smtp: {
          ...merged.smtp,
          pass: merged.smtp?.pass ? '******' : '',
          passSet: Boolean(merged.smtp?.pass),
        },
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

exports.listUserSessions = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const sessions = await UserSessionModel.findAll({
      where: { userId },
      order: [
        ['revokedAt', 'ASC'],
        ['lastSeenAt', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    response({
      res,
      payload: sessions.map((session) => serializeSession(session)),
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.revokeUserSession = async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    const sessionId = String(req.params.sessionId || '').trim();
    const session = await UserSessionModel.findOne({
      where: { _id: sessionId, userId },
    });
    if (!session) throw createError(404, 'Session not found');

    await revokeUserSession({ session, reason: 'admin-revoke' });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'security.session.revoke',
      entityType: 'user_session',
      entityId: session._id,
    });

    response({
      res,
      message: 'Session revoked',
      payload: serializeSession(session),
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

exports.listSuspiciousSessions = async (req, res) => {
  try {
    const reviewed = String(req.query.reviewed || '').trim();
    const where = { suspicious: true };
    if (reviewed === 'true') where.reviewedAt = { [Op.not]: null };
    if (reviewed === 'false') where.reviewedAt = null;

    const limit = Math.min(Number(req.query.limit || 100), 300);
    const sessions = await UserSessionModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
    });
    const list = toPlainMany(sessions);
    const userIds = [...new Set(list.map((item) => item.userId))];
    const profiles = userIds.length
      ? await ProfileModel.findAll({
          where: { userId: { [Op.in]: userIds } },
          attributes: ['userId', 'fullname', 'avatar', 'username'],
        })
      : [];
    const profileMap = new Map(
      toPlainMany(profiles).map((profile) => [
        profile.userId,
        {
          ...profile,
          avatar: toAbsoluteUploadUrl(profile.avatar),
        },
      ])
    );

    response({
      res,
      payload: list.map((session) => ({
        ...session,
        profile: profileMap.get(session.userId) || null,
      })),
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.reviewSuspiciousSession = async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '').trim();
    const action = String(req.body?.action || '').trim().toLowerCase();
    const session = await UserSessionModel.findOne({ where: { _id: sessionId } });
    if (!session) throw createError(404, 'Session not found');

    await session.update({
      reviewedAt: new Date(),
      reviewedBy: req.admin?._id || null,
    });

    if (action === 'revoke') {
      await revokeUserSession({ session, reason: 'suspicious-revoke' });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: action === 'revoke' ? 'security.suspicious.revoke' : 'security.suspicious.review',
      entityType: 'user_session',
      entityId: session._id,
    });

    response({
      res,
      message: action === 'revoke' ? 'Session revoked' : 'Session reviewed',
      payload: serializeSession(session),
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

exports.getPushStatus = async (req, res) => {
  try {
    const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
    const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
    const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || '').trim();
    const count = await PushSubscriptionModel.count();

    response({
      res,
      payload: {
        vapidConfigured: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
        vapidPublicKeySet: Boolean(VAPID_PUBLIC_KEY),
        vapidPrivateKeySet: Boolean(VAPID_PRIVATE_KEY),
        vapidSubject: VAPID_SUBJECT || null,
        subscriptions: count,
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.listAccountEraseRequests = async (req, res) => {
  try {
    const status = String(req.query.status || '').trim();
    const limit = Math.min(Number(req.query.limit || 100), 300);
    const where = {};
    if (['requested', 'in_progress', 'completed', 'rejected'].includes(status)) {
      where.status = status;
    }

    const rows = await AccountEraseRequestModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
    });
    const list = toPlainMany(rows);
    const userIds = [...new Set(list.map((item) => item.userId))];
    const profiles = userIds.length
      ? await ProfileModel.findAll({
          where: { userId: { [Op.in]: userIds } },
          attributes: ['userId', 'fullname', 'avatar', 'username'],
        })
      : [];
    const profileMap = new Map(
      toPlainMany(profiles).map((profile) => [
        profile.userId,
        {
          ...profile,
          avatar: toAbsoluteUploadUrl(profile.avatar),
        },
      ])
    );

    response({
      res,
      payload: list.map((item) => ({
        ...item,
        profile: profileMap.get(item.userId) || null,
      })),
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.createAccountEraseRequest = async (req, res) => {
  try {
    const userId = String(req.body?.userId || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 255);
    if (!userId) throw createError(400, 'userId is required');

    const row = await AccountEraseRequestModel.create({
      userId,
      status: 'requested',
      note: note || null,
      requestedAt: new Date(),
    });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'gdpr.erase.request',
      entityType: 'account_erase',
      entityId: row._id,
      metadata: { userId },
    });

    response({
      res,
      statusCode: 201,
      message: 'Erase request created',
      payload: row,
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

exports.updateAccountEraseRequest = async (req, res) => {
  try {
    const requestId = String(req.params.id || '').trim();
    const status = String(req.body?.status || '').trim();
    const note = String(req.body?.note || '').trim().slice(0, 255);
    const row = await AccountEraseRequestModel.findOne({ where: { _id: requestId } });
    if (!row) throw createError(404, 'Erase request not found');

    const next = {};
    if (['requested', 'in_progress', 'completed', 'rejected'].includes(status)) {
      next.status = status;
      if (status === 'completed') next.completedAt = new Date();
    }
    if (note) next.note = note;

    await row.update(next);

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'gdpr.erase.update',
      entityType: 'account_erase',
      entityId: row._id,
      metadata: { status: next.status || row.status },
    });

    response({
      res,
      message: 'Erase request updated',
      payload: row,
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

exports.getContentConfig = async (req, res) => {
  try {
    const [row] = await AdminContentConfigModel.findOrCreate({
      where: {},
      defaults: { blockedPreviewDomains: [] },
    });

    response({
      res,
      payload: {
        blockedPreviewDomains: asArray(row?.blockedPreviewDomains).filter(Boolean),
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.updateContentConfig = async (req, res) => {
  try {
    const [row] = await AdminContentConfigModel.findOrCreate({
      where: {},
      defaults: { blockedPreviewDomains: [] },
    });

    const blockedPreviewDomains = normalizePreviewDomains(
      req.body?.blockedPreviewDomains || []
    );

    await row.update({ blockedPreviewDomains });

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'content.config.update',
      entityType: 'content_config',
      entityId: row._id,
    });

    response({
      res,
      message: 'Content config updated',
      payload: { blockedPreviewDomains },
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.listContentChats = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const roomId = String(req.query.roomId || '').trim();
    const userId = String(req.query.userId || '').trim();
    const query = String(req.query.q || '').trim();
    const hasMedia = String(req.query.hasMedia || '').trim().toLowerCase();
    const fileType = String(req.query.fileType || '').trim().toLowerCase();
    const from = String(req.query.from || '').trim();
    const to = String(req.query.to || '').trim();

    const where = {};
    if (roomId) where.roomId = roomId;
    if (userId) where.userId = userId;
    if (query) where.text = { [Op.like]: `%${query}%` };
    if (hasMedia === 'true') where.fileId = { [Op.not]: null };
    if (hasMedia === 'false') where.fileId = null;
    if (from || to) {
      const start = from ? new Date(from) : new Date(0);
      const end = to ? new Date(to) : new Date();
      where.createdAt = { [Op.between]: [start, end] };
    }

    if (fileType && ['image', 'video', 'audio', 'document'].includes(fileType)) {
      const files = await FileModel.findAll({
        where: { type: fileType },
        attributes: ['fileId'],
      });
      const fileIds = files.map((file) => file.fileId);
      if (fileIds.length === 0) {
        response({ res, payload: [] });
        return;
      }
      where.fileId = { [Op.in]: fileIds };
    }

    const chats = await ChatModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const list = toPlainMany(chats);
    const fileIds = [
      ...new Set(list.map((item) => item.fileId).filter(Boolean)),
    ];
    const userIds = [
      ...new Set(list.map((item) => item.userId).filter(Boolean)),
    ];
    const roomIds = [
      ...new Set(list.map((item) => item.roomId).filter(Boolean)),
    ];

    const [files, profiles, groups, channels] = await Promise.all([
      fileIds.length
        ? FileModel.findAll({ where: { fileId: { [Op.in]: fileIds } } })
        : [],
      userIds.length
        ? ProfileModel.findAll({
            where: { userId: { [Op.in]: userIds } },
            attributes: ['userId', 'fullname', 'avatar', 'username'],
          })
        : [],
      roomIds.length
        ? GroupModel.findAll({
            where: { roomId: { [Op.in]: roomIds } },
            attributes: ['roomId', 'name'],
          })
        : [],
      roomIds.length
        ? ChannelModel.findAll({
            where: { roomId: { [Op.in]: roomIds } },
            attributes: ['roomId', 'name'],
          })
        : [],
    ]);

    const fileMap = new Map(
      toPlainMany(files).map((file) => [
        file.fileId,
        {
          ...file,
          url: toAbsoluteUploadUrl(file.url),
          thumbnailUrl: toAbsoluteUploadUrl(file.thumbnailUrl),
          streamUrl: toAbsoluteUploadUrl(file.streamUrl),
          streamHdUrl: toAbsoluteUploadUrl(file.streamHdUrl),
        },
      ])
    );
    const profileMap = new Map(
      toPlainMany(profiles).map((profile) => [
        profile.userId,
        {
          ...profile,
          avatar: toAbsoluteUploadUrl(profile.avatar),
        },
      ])
    );
    const groupMap = new Map(
      toPlainMany(groups).map((group) => [group.roomId, group])
    );
    const channelMap = new Map(
      toPlainMany(channels).map((channel) => [channel.roomId, channel])
    );

    response({
      res,
      payload: list.map((chat) => {
        const poll = parsePollFromText(chat.text || '');
        return {
          ...chat,
          file: chat.fileId ? fileMap.get(chat.fileId) || null : null,
          profile: profileMap.get(chat.userId) || null,
          room: groupMap.get(chat.roomId)
            ? { type: 'group', ...groupMap.get(chat.roomId) }
            : channelMap.get(chat.roomId)
              ? { type: 'channel', ...channelMap.get(chat.roomId) }
              : { type: 'private', roomId: chat.roomId },
          poll,
        };
      }),
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.deleteContentChats = async (req, res) => {
  try {
    const chatIds = asArray(req.body?.chatIds).filter(Boolean);
    if (chatIds.length === 0) throw createError(400, 'chatIds is required');

    const chats = await ChatModel.findAll({
      where: { _id: { [Op.in]: chatIds } },
    });
    if (chats.length === 0) throw createError(404, 'No chats found');

    const plainChats = toPlainMany(chats);
    const fileIds = [
      ...new Set(plainChats.map((chat) => chat.fileId).filter(Boolean)),
    ];
    const roomIds = [
      ...new Set(plainChats.map((chat) => chat.roomId).filter(Boolean)),
    ];

    if (fileIds.length > 0) {
      const files = await FileModel.findAll({
        where: { fileId: { [Op.in]: fileIds } },
      });
      await Promise.all(
        toPlainMany(files).flatMap((file) =>
          getFileCleanupUrls(file).map((targetUrl) =>
            deleteLocalFileByUrl(targetUrl)
          )
        )
      );
      await FileModel.destroy({ where: { fileId: { [Op.in]: fileIds } } });
    }

    await ChatModel.destroy({ where: { _id: { [Op.in]: chatIds } } });

    const inboxes = await InboxModel.findAll({
      where: { roomId: { [Op.in]: roomIds } },
    });
    const nowIso = new Date().toISOString();
    await Promise.all(
      toPlainMany(inboxes).map(async (inbox) => {
        const pinned = normalizePinnedMessages(inbox.pinnedMessages).filter(
          (item) => !chatIds.includes(item.chatId)
        );
        const history = normalizePinHistory(inbox.pinHistory);
        const removed = normalizePinnedMessages(inbox.pinnedMessages).filter(
          (item) => chatIds.includes(item.chatId)
        );
        if (removed.length === 0) return;
        const nextHistory = [
          ...history,
          ...removed.map((item) => ({
            chatId: item.chatId,
            action: 'unpin',
            actorId: req.admin?._id || 'admin',
            at: nowIso,
          })),
        ].slice(-300);
        await InboxModel.update(
          { pinnedMessages: pinned, pinHistory: nextHistory },
          { where: { _id: inbox._id } }
        );
        await emitPinsUpdate(inbox.roomId);
      })
    );

    if (global.io) {
      const grouped = plainChats.reduce((acc, chat) => {
        acc[chat.roomId] = acc[chat.roomId] || [];
        acc[chat.roomId].push(chat._id);
        return acc;
      }, {});
      Object.entries(grouped).forEach(([roomId, ids]) => {
        global.io.to(roomId).emit('chat/delete', {
          userId: req.admin?._id || 'admin',
          chatsId: ids,
        });
      });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'content.chat.delete',
      entityType: 'chat',
      entityId: chatIds.join(','),
      metadata: { count: chatIds.length },
    });

    response({
      res,
      message: 'Messages deleted',
      payload: { deleted: chatIds.length },
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

exports.listContentStatuses = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 200);
    const offset = Math.max(Number(req.query.offset || 0), 0);
    const userId = String(req.query.userId || '').trim();
    const type = String(req.query.type || '').trim();

    const where = {};
    if (userId) where.userId = userId;
    if (['text', 'photo', 'video'].includes(type)) where.type = type;

    const statuses = await StatusModel.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    const list = toPlainMany(statuses);
    const userIds = [
      ...new Set(list.map((item) => item.userId).filter(Boolean)),
    ];
    const profiles = userIds.length
      ? await ProfileModel.findAll({
          where: { userId: { [Op.in]: userIds } },
          attributes: ['userId', 'fullname', 'avatar', 'username'],
        })
      : [];
    const profileMap = new Map(
      toPlainMany(profiles).map((profile) => [
        profile.userId,
        {
          ...profile,
          avatar: toAbsoluteUploadUrl(profile.avatar),
        },
      ])
    );

    response({
      res,
      payload: list.map((item) => ({
        ...item,
        mediaUrl: toAbsoluteUploadUrl(item.mediaUrl),
        profile: profileMap.get(item.userId) || null,
      })),
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.deleteContentStatus = async (req, res) => {
  try {
    const statusId = String(req.params.id || '').trim();
    const status = await StatusModel.findOne({ where: { _id: statusId } });
    if (!status) throw createError(404, 'Status not found');

    await deleteLocalFileByUrl(status.mediaUrl);
    await status.destroy();

    if (global.io) {
      global.io.emit('status/update', { type: 'delete', statusId });
    }

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'content.status.delete',
      entityType: 'status',
      entityId: statusId,
    });

    response({
      res,
      message: 'Status removed',
      payload: { statusId },
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

exports.removePinnedMessage = async (req, res) => {
  try {
    const roomId = String(req.body?.roomId || '').trim();
    const chatId = String(req.body?.chatId || '').trim();
    if (!roomId || !chatId) throw createError(400, 'roomId and chatId required');

    const inbox = await InboxModel.findOne({ where: { roomId } });
    if (!inbox) throw createError(404, 'Room not found');

    const pinned = normalizePinnedMessages(inbox.pinnedMessages);
    const history = normalizePinHistory(inbox.pinHistory);
    const nextPinned = pinned.filter((item) => item.chatId !== chatId);
    const nowIso = new Date().toISOString();
    const nextHistory = [
      ...history,
      { chatId, action: 'unpin', actorId: req.admin?._id || 'admin', at: nowIso },
    ].slice(-300);

    await inbox.update({ pinnedMessages: nextPinned, pinHistory: nextHistory });
    await emitPinsUpdate(roomId);

    await logAdminAction({
      req,
      adminId: req.admin?._id,
      action: 'content.pin.remove',
      entityType: 'inbox',
      entityId: inbox._id,
      metadata: { chatId },
    });

    response({
      res,
      message: 'Pinned message removed',
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

exports.takedownPoll = async (req, res) => {
  try {
    const chatId = String(req.body?.chatId || '').trim();
    if (!chatId) throw createError(400, 'chatId is required');

    const chat = await ChatModel.findOne({ where: { _id: chatId } });
    if (!chat) throw createError(404, 'Message not found');

    const poll = parsePollFromText(chat.text || '');
    if (!poll) throw createError(400, 'Message is not a poll');

    req.body = { ...req.body, chatIds: [chatId] };
    await exports.deleteContentChats(req, res);
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
