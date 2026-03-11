const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/channel');

router.get('/channels', authenticate, ctrl.list);
router.get('/channels/:channelId', authenticate, ctrl.findById);
router.get('/channels/:channelId/analytics', authenticate, ctrl.analytics);
router.get('/channels/link/:token/meta', authenticate, ctrl.linkMeta);
router.get(
  '/channels/:channelId/participants/name',
  authenticate,
  ctrl.participantsName
);
router.get('/channels/:channelId/participants', authenticate, ctrl.participants);
router.get(
  '/channels/:channelId/pending-members',
  authenticate,
  ctrl.pendingMembers
);
router.post(
  '/channels/:channelId/participants',
  authenticate,
  ctrl.addParticipants
);
router.patch(
  '/channels/:channelId/permissions',
  authenticate,
  ctrl.updatePermissions
);
router.patch(
  '/channels/:channelId/moderation',
  authenticate,
  ctrl.updateModeration
);
router.post(
  '/channels/:channelId/pending-members/:memberId/approve',
  authenticate,
  ctrl.approvePendingMember
);
router.post(
  '/channels/:channelId/pending-members/:memberId/reject',
  authenticate,
  ctrl.rejectPendingMember
);
router.post(
  '/channels/:channelId/verify-password',
  authenticate,
  ctrl.verifyPassword
);
router.post('/channels/join-link', authenticate, ctrl.joinByLink);
router.patch('/channels/:channelId/privacy', authenticate, ctrl.updatePrivacy);
router.patch('/channels/:channelId/password', authenticate, ctrl.updatePassword);

module.exports = router;
