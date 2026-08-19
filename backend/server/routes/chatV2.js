const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const roomAccess = require('../middleware/roomAccess');
const ctrl = require('../controllers/chatV2');
const suggestions = require('../controllers/chatSuggestions');
const resumable = require('../controllers/chatResumableUpload');
const {
  cleanupQueryE2eeKeys,
  cleanupRoomE2eeKeys,
} = require('../helpers/e2eeKeyDirectory');

router.get('/chat-v2/messages/:chatId/receipts', authenticate, ctrl.getMessageReceipts);
router.get('/chat-v2/messages/:chatId/history', authenticate, ctrl.getEditHistory);

router.get('/chat-v2/drafts', authenticate, ctrl.listDrafts);
router.get('/chat-v2/drafts/:roomId', authenticate, roomAccess, ctrl.getDraft);
router.put('/chat-v2/drafts/:roomId', authenticate, roomAccess, ctrl.saveDraft);
router.delete('/chat-v2/drafts/:roomId', authenticate, roomAccess, ctrl.deleteDraft);

router.get('/chat-v2/mentions', authenticate, ctrl.listMentions);
router.get(
  '/chat-v2/mention-suggestions/:roomId',
  authenticate,
  roomAccess,
  suggestions.mentionSuggestions
);
router.get('/chat-v2/search', authenticate, ctrl.searchMessages);

router.get('/chat-v2/message-requests', authenticate, ctrl.listMessageRequests);
router.post(
  '/chat-v2/message-requests/:requestId/action',
  authenticate,
  ctrl.actionMessageRequest
);

router.get('/chat-v2/topics/:roomId', authenticate, roomAccess, ctrl.listTopics);
router.post('/chat-v2/topics/:roomId', authenticate, roomAccess, ctrl.createTopic);
router.patch('/chat-v2/topics/item/:topicId', authenticate, ctrl.updateTopic);
router.delete('/chat-v2/topics/item/:topicId', authenticate, ctrl.deleteTopic);

router.put('/chat-v2/e2ee/device-key', authenticate, ctrl.registerE2eeKey);
router.get(
  '/chat-v2/e2ee/keys',
  authenticate,
  cleanupQueryE2eeKeys,
  ctrl.listE2eeKeys
);
router.get(
  '/chat-v2/e2ee/rooms/:roomId',
  authenticate,
  roomAccess,
  cleanupRoomE2eeKeys,
  ctrl.getRoomE2ee
);
router.post(
  '/chat-v2/e2ee/rooms/:roomId',
  authenticate,
  roomAccess,
  cleanupRoomE2eeKeys,
  ctrl.setRoomE2ee
);

router.post('/chat-v2/uploads', authenticate, ctrl.initResumableUpload);
router.put(
  '/chat-v2/uploads/:uploadId/parts/:partNumber',
  authenticate,
  express.raw({ type: 'application/octet-stream', limit: '5mb' }),
  ctrl.putResumableChunk
);
router.get('/chat-v2/uploads/:uploadId', authenticate, ctrl.getResumableUpload);
router.post(
  '/chat-v2/uploads/:uploadId/complete',
  authenticate,
  resumable.complete
);
router.delete('/chat-v2/uploads/:uploadId', authenticate, ctrl.cancelResumableUpload);

router.post('/chat-v2/translate', authenticate, ctrl.translateMessage);
router.post('/chat-v2/transcribe', authenticate, ctrl.transcribeVoice);

module.exports = router;
