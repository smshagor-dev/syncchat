const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/chatV2');

router.get('/chat-v2/messages/:chatId/receipts', authenticate, ctrl.getMessageReceipts);
router.get('/chat-v2/messages/:chatId/history', authenticate, ctrl.getEditHistory);

router.get('/chat-v2/drafts', authenticate, ctrl.listDrafts);
router.get('/chat-v2/drafts/:roomId', authenticate, ctrl.getDraft);
router.put('/chat-v2/drafts/:roomId', authenticate, ctrl.saveDraft);
router.delete('/chat-v2/drafts/:roomId', authenticate, ctrl.deleteDraft);

router.get('/chat-v2/mentions', authenticate, ctrl.listMentions);
router.get('/chat-v2/search', authenticate, ctrl.searchMessages);

router.get('/chat-v2/message-requests', authenticate, ctrl.listMessageRequests);
router.post(
  '/chat-v2/message-requests/:requestId/action',
  authenticate,
  ctrl.actionMessageRequest
);

router.get('/chat-v2/topics/:roomId', authenticate, ctrl.listTopics);
router.post('/chat-v2/topics/:roomId', authenticate, ctrl.createTopic);
router.patch('/chat-v2/topics/item/:topicId', authenticate, ctrl.updateTopic);
router.delete('/chat-v2/topics/item/:topicId', authenticate, ctrl.deleteTopic);

router.put('/chat-v2/e2ee/device-key', authenticate, ctrl.registerE2eeKey);
router.get('/chat-v2/e2ee/keys', authenticate, ctrl.listE2eeKeys);
router.get('/chat-v2/e2ee/rooms/:roomId', authenticate, ctrl.getRoomE2ee);
router.post('/chat-v2/e2ee/rooms/:roomId', authenticate, ctrl.setRoomE2ee);

router.post('/chat-v2/uploads', authenticate, ctrl.initResumableUpload);
router.put(
  '/chat-v2/uploads/:uploadId/parts/:partNumber',
  authenticate,
  express.raw({ type: 'application/octet-stream', limit: '5mb' }),
  ctrl.putResumableChunk
);
router.get('/chat-v2/uploads/:uploadId', authenticate, ctrl.getResumableUpload);
router.post('/chat-v2/uploads/:uploadId/complete', authenticate, ctrl.completeResumableUpload);
router.delete('/chat-v2/uploads/:uploadId', authenticate, ctrl.cancelResumableUpload);

router.post('/chat-v2/translate', authenticate, ctrl.translateMessage);
router.post('/chat-v2/transcribe', authenticate, ctrl.transcribeVoice);

module.exports = router;
