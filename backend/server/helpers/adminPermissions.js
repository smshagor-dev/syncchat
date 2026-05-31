const AdminRoleModel = require('../db/models/adminRole');

const PERMISSIONS = {
  ADMIN_READ: 'admin.read',
  ADMIN_MANAGE: 'admin.manage',
  ROLE_READ: 'roles.read',
  ROLE_MANAGE: 'roles.manage',
  AUDIT_READ: 'audit.read',
  ACCESS_KEY_READ: 'access_keys.read',
  ACCESS_KEY_MANAGE: 'access_keys.manage',
  SESSION_READ: 'sessions.read',
  SESSION_MANAGE: 'sessions.manage',
  USER_READ: 'users.read',
  USER_WRITE: 'users.write',
  USER_BAN: 'users.ban',
  CONTENT_DELETE: 'content.delete',
  REPORT_READ: 'reports.read',
  REPORT_WRITE: 'reports.write',
  DATA_EXPORT: 'data.export',
  GROUP_READ: 'groups.read',
  GROUP_WRITE: 'groups.write',
  GROUP_BAN: 'groups.ban',
  CHANNEL_READ: 'channels.read',
  CHANNEL_WRITE: 'channels.write',
  CHANNEL_BAN: 'channels.ban',
  SECURITY_READ: 'security.read',
  SECURITY_WRITE: 'security.write',
  APP_CONFIG_READ: 'app_config.read',
  APP_CONFIG_WRITE: 'app_config.write',
  ANALYTICS_READ: 'analytics.read',
  SYSTEM_MANAGE: 'system.manage',
};

const DEFAULT_ROLES = [
  {
    name: 'super-admin',
    description: 'Full system access',
    permissions: ['*'],
    isSystem: true,
  },
  {
    name: 'moderator',
    description: 'Moderation-focused access',
    permissions: [
      PERMISSIONS.ADMIN_READ,
      PERMISSIONS.ROLE_READ,
      PERMISSIONS.AUDIT_READ,
      PERMISSIONS.ACCESS_KEY_READ,
      PERMISSIONS.SESSION_READ,
      PERMISSIONS.USER_READ,
      PERMISSIONS.USER_WRITE,
      PERMISSIONS.USER_BAN,
      PERMISSIONS.CONTENT_DELETE,
      PERMISSIONS.GROUP_READ,
      PERMISSIONS.GROUP_WRITE,
      PERMISSIONS.GROUP_BAN,
      PERMISSIONS.CHANNEL_READ,
      PERMISSIONS.CHANNEL_WRITE,
      PERMISSIONS.CHANNEL_BAN,
      PERMISSIONS.REPORT_READ,
      PERMISSIONS.REPORT_WRITE,
      PERMISSIONS.DATA_EXPORT,
      PERMISSIONS.SECURITY_READ,
      PERMISSIONS.SECURITY_WRITE,
      PERMISSIONS.APP_CONFIG_READ,
      PERMISSIONS.APP_CONFIG_WRITE,
      PERMISSIONS.ANALYTICS_READ,
      PERMISSIONS.SYSTEM_MANAGE,
    ],
    isSystem: true,
  },
];

const listPermissions = () => Object.values(PERMISSIONS);

const ensureDefaultRoles = async () => {
  const existing = await AdminRoleModel.findAll();
  const existingNames = new Set(existing.map((role) => role.name));

  await Promise.all(
    DEFAULT_ROLES.filter((role) => !existingNames.has(role.name)).map((role) =>
      AdminRoleModel.create(role)
    )
  );

  return AdminRoleModel.findAll({ order: [['name', 'ASC']] });
};

const resolveRolePermissions = async ({ roleId, roleName }) => {
  if (roleId) {
    const role = await AdminRoleModel.findOne({ where: { _id: roleId } });
    return role?.permissions || [];
  }

  if (roleName) {
    const role = await AdminRoleModel.findOne({ where: { name: roleName } });
    return role?.permissions || [];
  }

  return [];
};

const hasPermission = ({ permissions = [], needed }) => {
  if (!needed) return true;
  if (permissions.includes('*')) return true;
  const list = Array.isArray(needed) ? needed : [needed];
  return list.every((perm) => permissions.includes(perm));
};

module.exports = {
  PERMISSIONS,
  DEFAULT_ROLES,
  ensureDefaultRoles,
  listPermissions,
  resolveRolePermissions,
  hasPermission,
};
