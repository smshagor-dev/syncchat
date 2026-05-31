const nodemailer = require('nodemailer');
const { loadAppConfig } = require('./appConfig');

module.exports = async ({ to, fullname, subject, html, otp }) => {
  const appConfig = await loadAppConfig();
  const smtp = appConfig?.smtp || {};
  const smtpReady = Boolean(smtp.host && smtp.port && smtp.user && smtp.pass);

  if (!smtpReady) {
    throw new Error('SMTP is not configured. Set it from Admin Settings > App Config.');
  }

  const options = {
    host: smtp.host,
    port: Number(smtp.port || 587),
    secure: Boolean(smtp.secure),
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  };

  const transporter = nodemailer.createTransport(options);
  const body = html.replace('#otp#', otp).replace('#fullname#', fullname);
  const fromEmail = smtp.fromEmail || smtp.user;
  const fromName = smtp.fromName || appConfig?.appName || 'SyncChat';

  const send = await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    html: body,
  });

  return send;
};
