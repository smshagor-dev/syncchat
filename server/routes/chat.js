const router = require('express').Router();
const authenticate = require('../middleware/auth');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/chat');

router.post('/chats/upload', authenticate, upload.single('file'), ctrl.upload);
router.post('/chats/send-file', authenticate, ctrl.sendFile);
router.get('/chats/media', authenticate, ctrl.findMedia);
router.get('/chats/calls', authenticate, ctrl.findCalls);
router.get('/chats/:roomId', authenticate, ctrl.findByRoomId);
router.delete('/chats/:roomId', authenticate, ctrl.deleteByRoomId);

module.exports = router;
