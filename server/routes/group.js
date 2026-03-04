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
router.get(
  '/groups/:groupId/pending-members',
  authenticate,
  ctrl.pendingMembers
);
router.post(
  '/groups/:groupId/participants',
  authenticate,
  ctrl.addParticipants
);
router.patch(
  '/groups/:groupId/permissions',
  authenticate,
  ctrl.updatePermissions
);
router.post(
  '/groups/:groupId/pending-members/:memberId/approve',
  authenticate,
  ctrl.approvePendingMember
);
router.post(
  '/groups/:groupId/pending-members/:memberId/reject',
  authenticate,
  ctrl.rejectPendingMember
);
router.post(
  '/groups/:groupId/verify-password',
  authenticate,
  ctrl.verifyPassword
);
router.post('/groups/join-link', authenticate, ctrl.joinByLink);
router.patch('/groups/:groupId/privacy', authenticate, ctrl.updatePrivacy);
router.patch('/groups/:groupId/password', authenticate, ctrl.updatePassword);

module.exports = router;
