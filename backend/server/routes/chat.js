const router = require('express').Router();
const authenticate = require('../middleware/auth');
const upload = require('../middleware/upload');
const chatSendIdempotency = require('../middleware/chatSendIdempotency');
const roomAccess = require('../middleware/roomAccess');
const ctrl = require('../controllers/chat');
const chatUpload = require('../controllers/chatUpload');
const chatDeletion = require('../controllers/chatDeletion');

router.post('/chats/upload', authenticate, upload.single('file'), chatUpload.upload);
router.post('/chats/send-file', authenticate, chatSendIdempotency, ctrl.sendFile);
router.post('/chats/:chatId/view-once-open', authenticate, ctrl.openViewOnce);
router.get('/chats/scheduled', authenticate, ctrl.findScheduled);
router.post('/chats/scheduled', authenticate, ctrl.createScheduled);
router.delete('/chats/scheduled/:scheduleId', authenticate, ctrl.cancelScheduled);
router.get('/chats/media', authenticate, ctrl.findMedia);
router.get('/chats/calls', authenticate, ctrl.findCalls);
router.get('/chats/starred', authenticate, ctrl.findStarred);
router.patch('/chats/:chatId/star', authenticate, ctrl.toggleStar);
router.get('/chats/:roomId/pins', authenticate, roomAccess, ctrl.findPinned);
router.post('/chats/:chatId/pin', authenticate, roomAccess, ctrl.pinMessage);
router.delete('/chats/:chatId/pin', authenticate, roomAccess, ctrl.unpinMessage);
router.get('/chats/:roomId', authenticate, roomAccess, ctrl.findByRoomId);
router.delete('/chats/:roomId', authenticate, chatDeletion.deleteByRoomId);

module.exports = router;
