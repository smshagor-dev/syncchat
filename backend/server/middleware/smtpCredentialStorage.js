const {
  encryptSmtpSecret,
  isEncryptedSmtpSecret,
} = require('../helpers/smtpSecret');

module.exports = (req, res, next) => {
  try {
    if (String(req.method || '').toUpperCase() !== 'PATCH' || !req.body?.smtp) {
      next();
      return;
    }

    req.body.smtp = { ...req.body.smtp };
    const pass = req.body.smtp.pass;
    if (pass === '******') {
      delete req.body.smtp.pass;
    } else if (pass !== undefined && String(pass) !== '') {
      req.body.smtp.pass = isEncryptedSmtpSecret(pass)
        ? String(pass)
        : encryptSmtpSecret(String(pass));
    }
    next();
  } catch (error0) {
    next(error0);
  }
};
