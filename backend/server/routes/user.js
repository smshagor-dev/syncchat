const router = require('express').Router();
const authenticate = require('../middleware/auth');

const ctrl = require('../controllers/user');
const authRecovery = require('../controllers/authRecovery');
const socialAuth = require('../controllers/socialAuth');

router.post('/users/register', authRecovery.register);
router.post('/users/login', ctrl.login);
router.post('/users/login/2fa-verify', ctrl.verifyLoginTwoFactor);
router.post('/users/device-link/info', ctrl.deviceLinkInfo);
router.post('/users/device-link/complete', ctrl.completeDeviceLink);
router.get('/users/social-config', socialAuth.socialConfig);
router.post('/users/social-auth', socialAuth.socialAuth);
router.post('/users/forgot-pass/request', authRecovery.requestForgotPass);
router.post('/users/forgot-pass/verify', authRecovery.verifyForgotPass);
router.post('/users/forgot-pass/reset', authRecovery.resetForgotPass);
router.post('/users/verify', authenticate, authRecovery.verify);
router.post('/users/verify/resend', authenticate, authRecovery.resendVerifyOtp);
router.post('/users/feedback', authenticate, ctrl.feedback);
router.get('/users', authenticate, ctrl.find);
router.delete('/users', authenticate, ctrl.delete);
router.patch('/users/change-pass', authenticate, ctrl.changePass);

module.exports = router;
