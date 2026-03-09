const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/setting');

router.get('/settings', authenticate, ctrl.find);
router.get('/settings/blocked-contacts', authenticate, ctrl.blockedContacts);
router.get('/settings/hidden-chats', authenticate, ctrl.hiddenChats);
router.get('/settings/account-export', authenticate, ctrl.accountExportStatus);
router.put('/settings', authenticate, ctrl.update);
router.post('/settings/account-export', authenticate, ctrl.requestAccountExport);
router.post('/settings/app-lock', authenticate, ctrl.setAppLock);
router.post('/settings/app-lock/verify', authenticate, ctrl.verifyAppLock);
router.post('/settings/two-factor/setup', authenticate, ctrl.setupTwoFactor);
router.post('/settings/two-factor/enable', authenticate, ctrl.enableTwoFactor);
router.post('/settings/two-factor/disable', authenticate, ctrl.disableTwoFactor);
router.put(
  '/settings/app-lock/password',
  authenticate,
  ctrl.changeAppLockPassword
);
router.delete('/settings/app-lock', authenticate, ctrl.removeAppLock);

module.exports = router;
