const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/report');

router.post('/reports/chat', authenticate, ctrl.chat);

module.exports = router;

