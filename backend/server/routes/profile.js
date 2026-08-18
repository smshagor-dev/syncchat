const router = require('express').Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/profile');

router.get('/profile-photos', authenticate, ctrl.resolvePhotoHistory);
router.delete('/profile-photos/:photoId', authenticate, ctrl.deleteProfilePhoto);
router.get('/profiles/:userId/photos', authenticate, ctrl.profilePhotos);
router.get('/profiles/:userId/common-groups', authenticate, ctrl.commonGroups);
router.get('/profiles/:userId', authenticate, ctrl.findById);
router.put('/profiles', authenticate, ctrl.edit);

module.exports = router;
