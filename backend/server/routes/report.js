const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/report');

router.post('/reports/chat', authenticate, ctrl.chat);
router.get('/reports/rooms/:roomId', authenticate, ctrl.roomCenter);
router.patch('/reports/:reportId', authenticate, ctrl.updateStatus);

module.exports = router;
