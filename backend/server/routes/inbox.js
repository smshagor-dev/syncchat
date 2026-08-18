const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/inbox');
const chatSecurity = require('../controllers/chatSecurity');

router.get('/inboxes', authenticate, ctrl.find);
router.get('/inboxes/:roomId', authenticate, ctrl.findByRoomId);
router.patch(
  '/inboxes/:roomId/preferences',
  authenticate,
  chatSecurity.guardLegacyLockPreference,
  ctrl.updatePreferences
);
router.post(
  '/inboxes/:roomId/verify-lock',
  authenticate,
  chatSecurity.verifyChatLock
);
router.post(
  '/inboxes/:roomId/chat-lock',
  authenticate,
  chatSecurity.createChatLock
);
router.patch(
  '/inboxes/:roomId/chat-lock',
  authenticate,
  chatSecurity.changeChatLockPassword
);
router.delete(
  '/inboxes/:roomId/chat-lock',
  authenticate,
  chatSecurity.removeChatLock
);
router.post('/inboxes/:roomId/clear', authenticate, ctrl.clearByRoomId);
router.post('/inboxes/read-all', authenticate, ctrl.markAllRead);

module.exports = router;
