const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const { requirePermission } = require('../middleware/adminPermission');
const { PERMISSIONS } = require('../helpers/adminPermissions');
const callingAdmin = require('../controllers/callingAdmin');

router.get(
  '/admin/calling/config',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_READ),
  callingAdmin.getCallConfig
);

router.patch(
  '/admin/calling/config',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_WRITE),
  callingAdmin.updateCallConfig
);

router.post(
  '/admin/calling/config/test',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_WRITE),
  callingAdmin.testCallConfig
);

module.exports = router;
