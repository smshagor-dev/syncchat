const response = require('../helpers/response');
const { hasPermission } = require('../helpers/adminPermissions');

const requirePermission = (needed) => (req, res, next) => {
  const permissions = req.adminPermissions || [];
  if (hasPermission({ permissions, needed })) {
    next();
    return;
  }

  response({
    res,
    statusCode: 403,
    success: false,
    message: 'Insufficient admin permissions',
  });
};

module.exports = { requirePermission };
