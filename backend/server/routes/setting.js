const router = require('express').Router();
const multer = require('multer');
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/setting');
const accountStorage = require('../controllers/accountStorage');
const nativePush = require('../controllers/nativePush');

const backupLimitMb = Number(process.env.ACCOUNT_BACKUP_UPLOAD_LIMIT_MB || 100);
const restoreUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize:
      Number.isFinite(backupLimitMb) && backupLimitMb > 0
        ? backupLimitMb * 1024 * 1024
        : 100 * 1024 * 1024,
  },
});

router.get('/settings', authenticate, ctrl.find);
router.get('/settings/blocked-contacts', authenticate, ctrl.blockedContacts);
router.get('/settings/hidden-chats', authenticate, ctrl.hiddenChats);
router.get('/settings/account-export', authenticate, accountStorage.accountExportStatus);
router.get('/settings/device-sessions', authenticate, ctrl.deviceSessions);
router.put('/settings', authenticate, ctrl.update);
router.post('/settings/device-link-request', authenticate, ctrl.createDeviceLinkRequest);
router.post('/settings/account-export', authenticate, accountStorage.requestAccountExport);
router.post('/settings/account-backup', authenticate, accountStorage.downloadEncryptedBackup);
router.post(
  '/settings/device-sessions/logout-others',
  authenticate,
  ctrl.revokeOtherDeviceSessions
);
router.post(
  '/settings/account-restore',
  authenticate,
  restoreUpload.single('archive'),
  accountStorage.restoreEncryptedBackup
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
router.post('/settings/push/native/register', authenticate, nativePush.register);
router.delete('/settings/push/native/unregister', authenticate, nativePush.unregister);
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