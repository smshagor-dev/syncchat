const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/community');

router.get('/communities', authenticate, ctrl.findAll);
router.get('/communities/:communityId/chats', authenticate, ctrl.findChats);
router.post('/communities', authenticate, ctrl.create);
router.post('/communities/:communityId/groups', authenticate, ctrl.createGroup);

module.exports = router;
