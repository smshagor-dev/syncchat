const router = require('express').Router();
// routes
const user = require('./user');
const chat = require('./chat');
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

router.use(user);
router.use(chat);
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

module.exports = router;
