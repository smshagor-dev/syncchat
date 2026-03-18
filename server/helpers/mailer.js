const nodemailer = require('nodemailer');
const config = require('../config');
const { loadAppConfig } = require('./appConfig');

module.exports = async ({ to, fullname, subject, html, otp }) => {
  const appConfig = await loadAppConfig();
  const smtp = appConfig?.smtp || {};
  const smtpReady = Boolean(smtp.host && smtp.port && smtp.user && smtp.pass);
  let options = {};

  if (smtpReady) {
    options = {
      host: smtp.host,
      port: Number(smtp.port || 587),
      secure: Boolean(smtp.secure),
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    };
  } else if (config.isDev) {
    options = {
      host: process.env.TEST_EMAIL_HOST,
      port: process.env.TEST_EMAIL_PORT,
      auth: {
        user: process.env.TEST_EMAIL_USER,
        pass: process.env.TEST_EMAIL_PASS,
      },
    };
  } else {
    options = {
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    };
  }

  const transporter = nodemailer.createTransport(options);
  const body = html.replace('#otp#', otp).replace('#fullname#', fullname);
  const fromEmail =
    smtp.fromEmail || smtp.user || process.env.EMAIL_USER || 'no-reply@syncchat.app';
  const fromName = smtp.fromName || appConfig?.appName || 'SyncChat';

  const send = await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html: body,
  });

  return send;
};
