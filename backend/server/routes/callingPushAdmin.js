const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const { requirePermission } = require('../middleware/adminPermission');
const { PERMISSIONS } = require('../helpers/adminPermissions');
const callingPushAdmin = require('../controllers/callingPushAdmin');

router.get(
  '/admin/calling/native-push',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_READ),
  callingPushAdmin.getConfig
);

router.patch(
  '/admin/calling/native-push',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_WRITE),
  callingPushAdmin.updateConfig
);

module.exports = router;
