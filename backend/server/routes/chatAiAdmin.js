const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const { requirePermission } = require('../middleware/adminPermission');
const { PERMISSIONS } = require('../helpers/adminPermissions');
const ctrl = require('../controllers/chatAiAdmin');

router.get(
  '/admin/chat-ai/config',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_READ),
  ctrl.getConfig
);
router.patch(
  '/admin/chat-ai/config',
  adminAuth,
  requirePermission(PERMISSIONS.APP_CONFIG_WRITE),
  ctrl.updateConfig
);

module.exports = router;
