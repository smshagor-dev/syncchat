const router = require('express').Router();
const admin = require('../controllers/admin');

// The controller atomically refuses registration once any admin exists. This
// route is intentionally unauthenticated only for zero-admin bootstrap.
router.post('/admin/register', admin.register);

module.exports = router;
