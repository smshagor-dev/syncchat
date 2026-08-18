const router = require('express').Router();
const adminAuth = require('../middleware/adminAuth');
const adminPassword = require('../controllers/adminPassword');

router.patch('/admin/profile/password', adminAuth, adminPassword.changePassword);

module.exports = router;
