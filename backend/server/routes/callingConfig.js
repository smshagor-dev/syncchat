const router = require('express').Router();
const authenticate = require('../middleware/auth');
const callingConfig = require('../controllers/callingConfig');

router.get('/calling/config', authenticate, callingConfig.getRuntimeConfig);
router.get('/calling/session/:callId', authenticate, callingConfig.getSessionMedia);
router.post('/calling/sfu-token', authenticate, callingConfig.getSfuToken);

module.exports = router;
