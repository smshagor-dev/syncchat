const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/setting');

router.get('/settings', authenticate, ctrl.find);
router.put('/settings', authenticate, ctrl.update);
router.post('/settings/app-lock', authenticate, ctrl.setAppLock);
router.post('/settings/app-lock/verify', authenticate, ctrl.verifyAppLock);
router.put(
  '/settings/app-lock/password',
  authenticate,
  ctrl.changeAppLockPassword
);
router.delete('/settings/app-lock', authenticate, ctrl.removeAppLock);

module.exports = router;
