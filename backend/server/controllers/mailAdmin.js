const response = require('../helpers/response');
const mailer = require('../helpers/mailer');

exports.status = async (req, res) => {
  try {
    const verify = String(req.query.verify || '') === '1';
    const payload = await mailer.getMailStatus({ verify });
    response({
      res,
      statusCode: payload.configured && (!verify || payload.verified) ? 200 : 503,
      success: payload.configured && (!verify || payload.verified),
      message: payload.verified
        ? 'SMTP connection verified'
        : payload.configured
          ? 'SMTP is configured but not verified'
          : 'SMTP is not fully configured',
      payload,
    });
  } catch (error0) {
    response({
      res,
      statusCode: 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.test = async (req, res) => {
  try {
    const to = String(req.body?.to || req.admin?.email || '').trim();
    const sent = await mailer({
      to,
      fullname: req.admin?.fullname || 'SyncChat Administrator',
      subject: 'SyncChat SMTP test',
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111827">
          <h2>SMTP delivery test passed</h2>
          <p>This message confirms that SyncChat can authenticate with the configured SMTP server and submit email successfully.</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
          <p>If this message reached spam, configure SPF, DKIM and DMARC for the From Email domain.</p>
        </div>
      `,
      otp: '',
    });

    response({
      res,
      message: 'SMTP test email submitted successfully',
      payload: {
        messageId: sent.messageId || null,
        accepted: Array.isArray(sent.accepted) ? sent.accepted.length : 0,
        rejected: Array.isArray(sent.rejected) ? sent.rejected.length : 0,
        response: sent.response || null,
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.code === 'SMTP_NOT_CONFIGURED' ? 503 : 502,
      success: false,
      message: error0.message,
      payload: {
        code: error0.code || 'SMTP_TEST_FAILED',
        responseCode: error0.responseCode || null,
      },
    });
  }
};
