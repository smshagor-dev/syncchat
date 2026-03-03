const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/group');

router.get('/groups/:groupId', authenticate, ctrl.findById);
router.get('/groups/link/:token/meta', authenticate, ctrl.linkMeta);
router.get(
  '/groups/:groupId/participants/name',
  authenticate,
  ctrl.participantsName
);
router.get('/groups/:groupId/participants', authenticate, ctrl.participants);
router.post('/groups/:groupId/participants', authenticate, ctrl.addParticipants);
router.post('/groups/:groupId/verify-password', authenticate, ctrl.verifyPassword);
router.post('/groups/join-link', authenticate, ctrl.joinByLink);
router.patch('/groups/:groupId/privacy', authenticate, ctrl.updatePrivacy);
router.patch('/groups/:groupId/password', authenticate, ctrl.updatePassword);

module.exports = router;
