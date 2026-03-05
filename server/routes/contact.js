const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/contact');

router.post('/contacts', authenticate, ctrl.insert);
router.get('/contacts', authenticate, ctrl.find);
router.get('/contacts/search', authenticate, ctrl.search);
router.post('/contacts/mobile-sync', authenticate, ctrl.mobileSync);
router.get('/contacts/:friendId/block-state', authenticate, ctrl.blockState);
router.put('/contacts/:friendId/block', authenticate, ctrl.block);
router.put('/contacts/:friendId/unblock', authenticate, ctrl.unblock);
router.delete('/contacts/:friendId', authenticate, ctrl.deleteByFriendId);

module.exports = router;
