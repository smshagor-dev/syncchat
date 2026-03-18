const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/contact');

router.post('/contacts', authenticate, ctrl.insert);
router.get('/contacts', authenticate, ctrl.find);
router.get('/contacts/labels', authenticate, ctrl.listLabels);
router.post('/contacts/labels', authenticate, ctrl.createLabel);
router.put('/contacts/labels/:labelId', authenticate, ctrl.updateLabel);
router.delete('/contacts/labels/:labelId', authenticate, ctrl.deleteLabel);
router.get('/contacts/search', authenticate, ctrl.search);
router.post('/contacts/mobile-sync', authenticate, ctrl.mobileSync);
router.get('/contacts/:friendId/block-state', authenticate, ctrl.blockState);
router.put('/contacts/:friendId/block', authenticate, ctrl.block);
router.put('/contacts/:friendId/unblock', authenticate, ctrl.unblock);
router.put('/contacts/:friendId/labels', authenticate, ctrl.updateContactLabels);
router.delete('/contacts/:friendId', authenticate, ctrl.deleteByFriendId);

module.exports = router;
