const router = require('express').Router();
const {
  processScheduledMessages,
} = require('../helpers/scheduledMessages');
const {
  cleanupChatMaintenance,
} = require('../helpers/chatMaintenance');

const authorizeCron = (req, res) => {
  const secret = String(process.env.CRON_SECRET || '').trim();
  const authorization = String(req.headers.authorization || '');

  if (!secret || authorization !== `Bearer ${secret}`) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized cron request',
    });
    return false;
  }
  return true;
};

router.get('/internal/scheduled-messages/run', async (req, res) => {
  if (!authorizeCron(req, res)) return;

  try {
    await processScheduledMessages();
    const chatMaintenance = await cleanupChatMaintenance();
    res.status(200).json({
      success: true,
      message: 'Scheduled messages and chat maintenance processed',
      chatMaintenance,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Scheduled message processing failed',
    });
  }
});

router.get('/internal/chat-maintenance/run', async (req, res) => {
  if (!authorizeCron(req, res)) return;

  try {
    const payload = await cleanupChatMaintenance();
    res.status(200).json({
      success: true,
      message: 'Chat maintenance processed',
      payload,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Chat maintenance failed',
    });
  }
});

module.exports = router;
