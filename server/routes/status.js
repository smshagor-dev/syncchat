const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/status');

router.get('/statuses', authenticate, ctrl.find);
router.post('/statuses', authenticate, ctrl.insert);
router.delete('/statuses/:statusId', authenticate, ctrl.deleteById);

module.exports = router;
