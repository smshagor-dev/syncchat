const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/inbox');

router.get('/inboxes', authenticate, ctrl.find);
router.patch(
  '/inboxes/:roomId/preferences',
  authenticate,
  ctrl.updatePreferences
);
router.post('/inboxes/:roomId/verify-lock', authenticate, ctrl.verifyChatLock);
router.post('/inboxes/:roomId/clear', authenticate, ctrl.clearByRoomId);

module.exports = router;
