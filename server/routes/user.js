const router = require('express').Router();
const authenticate = require('../middleware/auth');

const ctrl = require('../controllers/user');

router.post('/users/register', ctrl.register);
router.post('/users/login', ctrl.login);
router.post('/users/login/2fa-verify', ctrl.verifyLoginTwoFactor);
router.get('/users/social-config', ctrl.socialConfig);
router.post('/users/social-auth', ctrl.socialAuth);
router.post('/users/forgot-pass/request', ctrl.requestForgotPass);
router.post('/users/forgot-pass/verify', ctrl.verifyForgotPass);
router.post('/users/forgot-pass/reset', ctrl.resetForgotPass);
router.post('/users/verify', authenticate, ctrl.verify);
router.post('/users/verify/resend', authenticate, ctrl.resendVerifyOtp);
router.post('/users/feedback', authenticate, ctrl.feedback);
router.get('/users', authenticate, ctrl.find);
router.delete('/users', authenticate, ctrl.delete);
router.patch('/users/change-pass', authenticate, ctrl.changePass);

module.exports = router;
