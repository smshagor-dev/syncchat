const router = require('express').Router();
const mongoose = require('mongoose');
const { isRedisConfigured } = require('../helpers/socketAdapter');

// lightweight deployment health check
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
const storageAdmin = require('./storageAdmin');
const callingAdmin = require('./callingAdmin');
const callingPushAdmin = require('./callingPushAdmin');
const chatAiAdmin = require('./chatAiAdmin');
const adminProfileSecurity = require('./adminProfileSecurity');
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
router.use(storageAdmin);
router.use(callingAdmin);
router.use(callingPushAdmin);
router.use(chatAiAdmin);
router.use(adminProfileSecurity);
router.use(admin);

module.exports = router;
