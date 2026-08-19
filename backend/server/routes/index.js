const router = require('express').Router();
const mongoose = require('mongoose');
const {
  getSocketRedisCommandClient,
  isRedisConfigured,
} = require('../helpers/socketAdapter');
const mailer = require('../helpers/mailer');
const smtpCredentialStorage = require('../middleware/smtpCredentialStorage');

// Lightweight liveness probe: process + database connection.
router.get('/health', (req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  res.status(mongoReady ? 200 : 503).json({
    success: mongoReady,
    service: 'syncchat-backend',
    runtime: process.env.VERCEL === '1' ? 'vercel' : 'node',
    mongo: mongoReady ? 'connected' : 'not-ready',
    redis: isRedisConfigured() ? 'configured' : 'not-configured',
    timestamp: new Date().toISOString(),
  });
});

// Readiness includes the shared Redis path when Redis is configured. SMTP is
// reported for diagnostics but does not take chat/API traffic offline.
router.get('/ready', async (req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  let redisReady = !isRedisConfigured();
  if (isRedisConfigured()) {
    try {
      const redis = await getSocketRedisCommandClient();
      redisReady = Boolean(redis?.isReady && (await redis.ping()) === 'PONG');
    } catch (error0) {
      redisReady = false;
    }
  }

  const mailStatus = await mailer.getMailStatus({ verify: false });
  const ready = mongoReady && redisReady;
  res.status(ready ? 200 : 503).json({
    success: ready,
    service: 'syncchat-backend',
    mongo: mongoReady ? 'ready' : 'not-ready',
    redis: isRedisConfigured()
      ? redisReady
        ? 'ready'
        : 'not-ready'
      : 'not-configured',
    mail: mailStatus.configured ? 'configured' : 'not-configured',
    timestamp: new Date().toISOString(),
  });
});

// routes
const cron = require('./cron');
const user = require('./user');
const chat = require('./chat');
const chatV2 = require('./chatV2');
const contact = require('./contact');
const setting = require('./setting');
const profile = require('./profile');
const inbox = require('./inbox');
const group = require('./group');
const channel = require('./channel');
const avatar = require('./avatar');
const status = require('./status');
const community = require('./community');
const report = require('./report');
const contentControls = require('./contentControls');
const appConfig = require('./appConfig');
const callingConfig = require('./callingConfig');
const storagePublic = require('./storagePublic');
const storageAdmin = require('./storageAdmin');
const callingAdmin = require('./callingAdmin');
const callingPushAdmin = require('./callingPushAdmin');
const socialAuthAdmin = require('./socialAuthAdmin');
const chatAiAdmin = require('./chatAiAdmin');
const adminProfileSecurity = require('./adminProfileSecurity');
const mailAdmin = require('./mailAdmin');
const adminBootstrap = require('./adminBootstrap');
const admin = require('./admin');

router.use(cron);
router.use(user);
router.use(chat);
router.use(chatV2);
router.use(contact);
router.use(setting);
router.use(profile);
router.use(inbox);
router.use(group);
router.use(channel);
router.use(avatar);
router.use(status);
router.use(community);
router.use(report);
router.use(contentControls);
router.use(appConfig);
router.use(callingConfig);
router.use(storagePublic);
router.use(storageAdmin);
router.use(callingAdmin);
router.use(callingPushAdmin);
router.use(socialAuthAdmin);
router.use(chatAiAdmin);
router.use(adminProfileSecurity);
router.use(mailAdmin);
router.use(adminBootstrap);
router.use('/admin/app-config', smtpCredentialStorage);
router.use(admin);

module.exports = router;
