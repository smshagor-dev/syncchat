const router = require('express').Router();
const controller = require('../controllers/storagePublic');

router.get('/storage/image', controller.image);
router.get('/pwa/icon/:size.png', controller.pwaIcon);

module.exports = router;
