const router = require('express').Router();
const {
  processScheduledMessages,
} = require('../helpers/scheduledMessages');

router.get('/internal/scheduled-messages/run', async (req, res) => {
  const secret = String(process.env.CRON_SECRET || '').trim();
  const authorization = String(req.headers.authorization || '');

  if (!secret || authorization !== `Bearer ${secret}`) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized cron request',
    });
    return;
  }

  try {
    await processScheduledMessages();
    res.status(200).json({
      success: true,
      message: 'Scheduled messages processed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Scheduled message processing failed',
    });
  }
});

module.exports = router;
