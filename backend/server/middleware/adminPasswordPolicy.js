const { validatePassword } = require('../helpers/authCodes');

module.exports = (req, res, next) => {
  const method = String(req.method || '').toUpperCase();
  const path = String(req.path || '');
  const protectedCreate =
    method === 'POST' &&
    ['/admin/register', '/admin/admins'].includes(path);

  if (!protectedCreate) {
    next();
    return;
  }

  const passwordError = validatePassword(req.body?.password);
  if (passwordError) {
    res.status(400).json({ success: false, message: passwordError });
    return;
  }
  next();
};
