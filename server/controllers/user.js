const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const UserModel = require('../db/models/user');
const ProfileModel = require('../db/models/profile');
const SettingModel = require('../db/models/setting');
const GroupModel = require('../db/models/group');
const ContactModel = require('../db/models/contact');

const { toPlain, asArray, pullFromArray } = require('../db/utils');
const response = require('../helpers/response');
const mailer = require('../helpers/mailer');
const { toAbsoluteUploadUrl } = require('../helpers/storage');

const encrypt = require('../helpers/encrypt');
const decrypt = require('../helpers/decrypt');

const createError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

exports.register = async (req, res) => {
  try {
    const otp = Math.floor(1000 + Math.random() * 9000);

    const user = await UserModel.create({
      ...req.body,
      password: encrypt(req.body.password),
      otp,
    });
    const userId = user._id;

    await SettingModel.create({ userId });
    await ProfileModel.create({
      ...req.body,
      userId,
      fullname: req.body.fullname,
    });

    const token = jwt.sign({ _id: userId }, 'shhhhh');
    const template = fs.readFileSync(
      path.resolve(__dirname, '../helpers/templates/otp.html'),
      'utf8'
    );

    await mailer({
      to: req.body.email,
      fullname: req.body.fullname,
      subject: 'Please activate your account',
      html: template,
      otp,
    });

    response({
      res,
      statusCode: 201,
      message: 'Successfully created a new account',
      payload: token,
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.verify = async (req, res) => {
  try {
    const { userId, otp } = req.body;
    const user = await UserModel.findOne({ where: { _id: userId, otp } });

    if (!user) {
      throw createError(401, 'Invalid OTP code');
    }

    user.verified = true;
    user.otp = null;
    await user.save();

    response({
      res,
      message: 'Successfully verified an account',
      payload: toPlain(user),
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.resendVerifyOtp = async (req, res) => {
  try {
    const user = await UserModel.findOne({ where: { _id: req.user._id } });
    if (!user) throw createError(404, 'User not found');
    if (user.verified) throw createError(400, 'Account already verified');

    const otp = Math.floor(1000 + Math.random() * 9000);
    const template = fs.readFileSync(
      path.resolve(__dirname, '../helpers/templates/otp.html'),
      'utf8'
    );

    await user.update({ otp });
    await mailer({
      to: user.email,
      fullname: user.fullname || user.username,
      subject: 'Please activate your account',
      html: template,
      otp,
    });

    response({
      res,
      message: 'OTP code sent successfully',
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await UserModel.findOne({
      where: {
        [Op.or]: [{ email: username }, { username }],
      },
    });

    if (!user) {
      throw createError(401, 'Username or email not registered');
    }

    if (!user.password || typeof user.password !== 'string') {
      throw createError(401, 'Invalid password');
    }

    try {
      decrypt(password, user.password);
    } catch (error0) {
      throw createError(401, 'Invalid password');
    }

    const token = jwt.sign({ _id: user._id }, 'shhhhh');

    response({
      res,
      statusCode: 200,
      message: 'Successfully logged in',
      payload: token,
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.find = async (req, res) => {
  try {
    const user = await UserModel.findOne({
      where: { _id: req.user._id },
      attributes: { exclude: ['password'] },
    });
    const profile = await ProfileModel.findOne({
      where: { userId: req.user._id },
      attributes: ['avatar'],
    });

    response({
      res,
      payload: {
        ...toPlain(user),
        avatar: toAbsoluteUploadUrl(profile?.avatar || null),
      },
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.feedback = async (req, res) => {
  try {
    const message = (req.body.message || '').trim();

    if (message.length < 10) {
      throw createError(400, 'Feedback must be at least 10 characters long');
    }

    const user = await UserModel.findOne({ where: { _id: req.user._id } });
    if (!user) throw createError(404, 'User not found');

    const to = process.env.FEEDBACK_EMAIL || process.env.EMAIL_USER;
    if (!to) {
      throw createError(
        500,
        'Feedback email is not configured on server environment'
      );
    }

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>New user feedback</h2>
        <p><strong>User:</strong> ${user.username} (${user.email})</p>
        <p><strong>User ID:</strong> ${user._id}</p>
        <p><strong>Submitted at:</strong> ${new Date().toISOString()}</p>
        <hr />
        <p style="white-space: pre-wrap;">${message}</p>
      </div>
    `;

    await mailer({
      to,
      fullname: user.fullname || user.username,
      subject: `Feedback from @${user.username}`,
      html,
      otp: '',
    });

    response({
      res,
      message: 'Feedback sent successfully',
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.delete = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    const compare = decrypt(req.body.password, user.password);
    if (!compare) throw createError(401, 'Invalid password');

    await UserModel.destroy({ where: { _id: userId } });
    await ProfileModel.destroy({ where: { userId } });
    await SettingModel.destroy({ where: { userId } });
    await ContactModel.destroy({ where: { userId } });

    const groups = await GroupModel.findAll();
    await Promise.all(
      groups.map(async (group) => {
        const participants = asArray(group.participantsId);
        if (!participants.includes(userId)) return;
        await group.update({
          participantsId: pullFromArray(participants, [userId]),
        });
      })
    );

    response({
      res,
      message: 'Account deleted successfully',
      payload: toPlain(user),
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.changePass = async (req, res) => {
  try {
    const userId = req.user._id;
    const { oldPass, newPass, confirmNewPass } = req.body;

    const user = await UserModel.findOne({ where: { _id: userId } });
    if (!user) throw createError(404, 'User not found');

    if (!decrypt(oldPass, user.password)) {
      throw createError(401, 'Invalid password');
    }

    if (newPass !== confirmNewPass) {
      throw createError(400, "New password doesn't match");
    }

    await user.update({ password: encrypt(newPass) });

    const payload = toPlain(user);
    delete payload.password;
    response({
      res,
      message: 'Password changed successfully',
      payload,
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.requestForgotPass = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await UserModel.findOne({ where: { email } });

    if (!user) {
      response({
        res,
        message:
          'If your email is registered, a verification code has been sent',
      });
      return;
    }

    const otp = Math.floor(1000 + Math.random() * 9000);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const template = fs.readFileSync(
      path.resolve(__dirname, '../helpers/templates/otp.html'),
      'utf8'
    );

    await user.update({
      resetOtp: otp,
      resetOtpExpires: expiresAt,
      resetOtpVerified: false,
    });

    await mailer({
      to: user.email,
      fullname: user.fullname || user.username,
      subject: 'Password reset code',
      html: template,
      otp,
    });

    response({
      res,
      message: 'If your email is registered, a verification code has been sent',
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.verifyForgotPass = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await UserModel.findOne({
      where: {
        email,
        resetOtp: otp,
        resetOtpExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      throw createError(401, 'Invalid or expired verification code');
    }

    await user.update({ resetOtpVerified: true });

    response({
      res,
      message: 'Verification code accepted',
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.resetForgotPass = async (req, res) => {
  try {
    const { email, newPass, confirmNewPass } = req.body;

    if (newPass !== confirmNewPass) {
      throw createError(400, "New password doesn't match");
    }

    const user = await UserModel.findOne({
      where: {
        email,
        resetOtpVerified: true,
        resetOtpExpires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      throw createError(
        401,
        'Reset session expired. Please request a new code'
      );
    }

    await user.update({
      password: encrypt(newPass),
      resetOtp: null,
      resetOtpExpires: null,
      resetOtpVerified: false,
    });

    response({
      res,
      message: 'Password reset successfully',
    });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};
