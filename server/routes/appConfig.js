const router = require('express').Router();
const appConfig = require('../controllers/appConfig');

router.get('/app-config', appConfig.getPublicConfig);

module.exports = router;
