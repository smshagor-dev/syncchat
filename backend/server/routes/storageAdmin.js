const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const { requirePermission } = require('../middleware/adminPermission');
const { PERMISSIONS } = require('../helpers/adminPermissions');
const storageAdmin = require('../controllers/storageAdmin');

router.get(
  '/admin/storage/ftp',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_READ),
  storageAdmin.getFtpConfig
);

router.patch(
  '/admin/storage/ftp',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_WRITE),
  storageAdmin.updateFtpConfig
);

router.post(
  '/admin/storage/ftp/test',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_WRITE),
  storageAdmin.testFtpConfig
);

module.exports = router;
