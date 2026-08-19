const router = require('express').Router();
const controller = require('../controllers/storagePublic');

router.get('/storage/image', controller.image);

module.exports = router;
