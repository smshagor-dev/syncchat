const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/status');
const uploadCtrl = require('../controllers/statusUpload');

router.get('/statuses', authenticate, ctrl.find);
router.post('/statuses', authenticate, ctrl.insert);
router.post('/statuses/from-upload', authenticate, uploadCtrl.insertFromUpload);
router.post('/statuses/:statusId/view', authenticate, ctrl.markViewed);
router.post('/statuses/:statusId/react', authenticate, ctrl.react);
router.post('/statuses/:statusId/reply', authenticate, ctrl.reply);
router.get('/statuses/:statusId/activity', authenticate, ctrl.activity);
router.delete('/statuses/:statusId', authenticate, ctrl.deleteById);

module.exports = router;
