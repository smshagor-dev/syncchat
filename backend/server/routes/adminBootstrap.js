const router = require('express').Router();
const AdminModel = require('../db/models/admin');
const AdminBootstrapLockModel = require('../db/models/adminBootstrapLock');
const admin = require('../controllers/admin');

const BOOTSTRAP_LOCK_TTL_MS = 5 * 60 * 1000;

const bootstrapGuard = async (req, res, next) => {
  try {
    if ((await AdminModel.count()) > 0) {
      next();
      return;
    }

    const existing = await AdminBootstrapLockModel.findOne({
      where: { key: 'first-admin' },
    });
    if (existing) {
      const acquiredAt = new Date(existing.acquiredAt || existing.createdAt || 0).getTime();
      if (acquiredAt > 0 && Date.now() - acquiredAt > BOOTSTRAP_LOCK_TTL_MS) {
        await AdminBootstrapLockModel.destroy({ where: { key: 'first-admin' } });
      } else {
        res.status(409).json({
          success: false,
          message: 'Administrator bootstrap is already in progress',
        });
        return;
      }
    }

    const [, created] = await AdminBootstrapLockModel.findOrCreate({
      where: { key: 'first-admin' },
      defaults: { key: 'first-admin', acquiredAt: new Date() },
    });
    if (!created) {
      res.status(409).json({
        success: false,
        message: 'Administrator bootstrap is already in progress',
      });
      return;
    }

    // Failed validation/storage/DB attempts release the short-lived lock so a
    // corrected first-admin request can be retried. Successful bootstrap keeps
    // the lock permanently; the controller also rejects once an admin exists.
    res.on('finish', () => {
      if (res.statusCode >= 400) {
        AdminBootstrapLockModel.destroy({ where: { key: 'first-admin' } }).catch(() => {});
      }
    });
    next();
  } catch (error0) {
    next(error0);
  }
};

router.post('/admin/register', bootstrapGuard, admin.register);

module.exports = router;
