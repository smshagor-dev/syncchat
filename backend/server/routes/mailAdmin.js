const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const { requirePermission } = require('../middleware/adminPermission');
const { PERMISSIONS } = require('../helpers/adminPermissions');
const ctrl = require('../controllers/mailAdmin');

router.get(
  '/admin/mail/status',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_READ),
  ctrl.status
);
router.post(
  '/admin/mail/test',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_WRITE),
  ctrl.test
);

module.exports = router;
