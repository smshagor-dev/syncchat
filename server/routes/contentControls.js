const router = require('express').Router();
const ctrl = require('../controllers/contentControls');

router.get('/content-controls', ctrl.getConfig);

module.exports = router;
