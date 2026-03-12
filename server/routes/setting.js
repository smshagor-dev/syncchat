const router = require('express').Router();
const multer = require('multer');
const os = require('os');
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/setting');
const restoreUpload = multer({ dest: os.tmpdir() });

router.get('/settings', authenticate, ctrl.find);
router.get('/settings/blocked-contacts', authenticate, ctrl.blockedContacts);
router.get('/settings/hidden-chats', authenticate, ctrl.hiddenChats);
router.get('/settings/account-export', authenticate, ctrl.accountExportStatus);
router.get('/settings/device-sessions', authenticate, ctrl.deviceSessions);
router.put('/settings', authenticate, ctrl.update);
router.post('/settings/device-link-request', authenticate, ctrl.createDeviceLinkRequest);
router.post('/settings/account-export', authenticate, ctrl.requestAccountExport);
router.post('/settings/account-backup', authenticate, ctrl.downloadEncryptedBackup);
router.post(
  '/settings/device-sessions/logout-others',
  authenticate,
  ctrl.revokeOtherDeviceSessions
);
router.post(
  '/settings/account-restore',
  authenticate,
  restoreUpload.single('archive'),
  ctrl.restoreEncryptedBackup
);
router.delete(
  '/settings/device-sessions/current',
  authenticate,
  ctrl.revokeCurrentDeviceSession
);
router.delete(
  '/settings/device-sessions/:sessionId',
  authenticate,
  ctrl.revokeDeviceSession
);
router.post('/settings/app-lock', authenticate, ctrl.setAppLock);
router.post('/settings/app-lock/verify', authenticate, ctrl.verifyAppLock);
router.post('/settings/two-factor/setup', authenticate, ctrl.setupTwoFactor);
router.post('/settings/two-factor/enable', authenticate, ctrl.enableTwoFactor);
router.post('/settings/two-factor/disable', authenticate, ctrl.disableTwoFactor);
router.get('/settings/push/public-key', authenticate, ctrl.getPushPublicKey);
router.post('/settings/push/subscribe', authenticate, ctrl.subscribePush);
router.post('/settings/push/unsubscribe', authenticate, ctrl.unsubscribePush);
router.get(
  '/settings/two-factor/recovery-codes',
  authenticate,
  ctrl.getTwoFactorRecoveryStatus
);
router.post(
  '/settings/two-factor/recovery-codes',
  authenticate,
  ctrl.generateTwoFactorRecoveryCodes
);
router.delete(
  '/settings/two-factor/recovery-codes',
  authenticate,
  ctrl.revokeTwoFactorRecoveryCodes
);
router.put(
  '/settings/app-lock/password',
  authenticate,
  ctrl.changeAppLockPassword
);
router.delete('/settings/app-lock', authenticate, ctrl.removeAppLock);

module.exports = router;
