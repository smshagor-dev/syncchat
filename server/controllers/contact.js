const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const ProfileModel = require('../db/models/profile');
const ContactModel = require('../db/models/contact');
const SettingModel = require('../db/models/setting');
const { toPlain, toPlainMany } = require('../db/utils');

const response = require('../helpers/response');

const asHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizePhone = (value = '') => String(value).replace(/\D/g, '');

const buildProfilePhones = (profile) => {
  const phone = normalizePhone(profile.phone);
  const dial = normalizePhone(profile.dialCode);
  const values = [
    phone,
    `${dial}${phone}`,
    phone.startsWith('0') ? `${dial}${phone.slice(1)}` : '',
  ].filter(Boolean);

  return [...new Set(values)];
};

const resolveFriendByIdentity = async (identityRaw = '') => {
  const identity = String(identityRaw).trim();
  const byPhone = normalizePhone(identity);

  let friend = await ProfileModel.findOne({
    where: {
      [Op.or]: [{ username: identity }, { email: identity }],
    },
  });

  if (friend || !byPhone) return friend;

  const profiles = await ProfileModel.findAll({
    where: {
      phone: { [Op.not]: '' },
    },
  });

  friend = toPlainMany(profiles).find((profile) => {
    const candidates = buildProfilePhones(profile);
    const last10 = byPhone.slice(-10);

    return (
      candidates.includes(byPhone) ||
      (last10.length === 10 && candidates.some((item) => item.endsWith(last10)))
    );
  });

  return friend || null;
};

exports.insert = async (req, res) => {
  try {
    const { username = '', email = '', phone = '', identity = '' } = req.body;
    const targetIdentity = identity || username || email || phone;

    const friend = await resolveFriendByIdentity(targetIdentity);

    if (!friend) {
      throw asHttpError(401, 'User not found');
    }

    const existing = await ContactModel.findOne({
      where: {
        userId: req.user._id,
        friendId: friend.userId,
      },
    });

    if (existing) {
      throw asHttpError(401, 'You have saved this contact');
    }

    const ifSavedByFriend = await ContactModel.findOne({
      where: {
        userId: friend.userId,
        friendId: req.user._id,
      },
    });

    const contact = await ContactModel.create({
      userId: req.user._id,
      roomId: ifSavedByFriend ? ifSavedByFriend.roomId : uuidv4(),
      friendId: friend.userId,
    });

    response({
      res,
      statusCode: 201,
      message: 'Successfully added contact',
      payload: toPlain(contact),
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

exports.search = async (req, res) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      response({ res, payload: [] });
      return;
    }

    const queryPhone = normalizePhone(query);
    const where = {
      userId: { [Op.ne]: req.user._id },
      [Op.or]: [
        { username: { [Op.like]: `%${query}%` } },
        { email: { [Op.like]: `%${query}%` } },
        { fullname: { [Op.like]: `%${query}%` } },
      ],
    };

    if (queryPhone.length >= 4) {
      where[Op.or].push({ phone: { [Op.like]: `%${queryPhone}%` } });
    }

    const profilesRaw = await ProfileModel.findAll({
      where,
      limit: 30,
    });
    const profiles = toPlainMany(profilesRaw);

    const friendIds = profiles.map((profile) => profile.userId);
    const savedRaw = friendIds.length
      ? await ContactModel.findAll({
          where: {
            userId: req.user._id,
            friendId: { [Op.in]: friendIds },
          },
          attributes: ['friendId', 'roomId'],
        })
      : [];

    const savedMap = new Map(
      toPlainMany(savedRaw).map((contact) => [contact.friendId, contact])
    );

    const payload = profiles.map((profile) => ({
      ...profile,
      isSaved: savedMap.has(profile.userId),
      roomId: savedMap.get(profile.userId)?.roomId || null,
    }));

    response({ res, payload });
  } catch (error0) {
    response({
      res,
      statusCode: error0.statusCode || 500,
      success: false,
      message: error0.message,
    });
  }
};

exports.mobileSync = async (req, res) => {
  try {
    const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
    if (contacts.length === 0) {
      response({
        res,
        payload: {
          registered: [],
          unregistered: [],
        },
      });
      return;
    }

    const prepared = contacts
      .map((item) => {
        const name = String(item.name || '').trim();
        const phonesRaw = Array.isArray(item.phones) ? item.phones : [];
        const singlePhone = item.phone ? [item.phone] : [];
        const phones = [
          ...new Set(
            phonesRaw.concat(singlePhone).map(normalizePhone).filter(Boolean)
          ),
        ];
        return {
          name,
          phones,
        };
      })
      .filter((item) => item.phones.length > 0);

    const profilesRaw = await ProfileModel.findAll({
      where: {
        userId: { [Op.ne]: req.user._id },
        phone: { [Op.not]: '' },
      },
    });
    const profiles = toPlainMany(profilesRaw);

    const phoneIndex = new Map();
    profiles.forEach((profile) => {
      buildProfilePhones(profile).forEach((phone) => {
        if (!phoneIndex.has(phone)) {
          phoneIndex.set(phone, profile);
        }
      });
    });

    const findByPhone = (phone) => {
      if (phoneIndex.has(phone)) return phoneIndex.get(phone);
      const last10 = phone.slice(-10);
      if (last10.length === 10) {
        const entry = [...phoneIndex.entries()].find(([key]) =>
          key.endsWith(last10)
        );
        if (entry) return entry[1];
      }
      return null;
    };

    const matched = new Map();
    const unregistered = [];

    prepared.forEach((item) => {
      const found = item.phones.map(findByPhone).find(Boolean);
      if (found) {
        if (!matched.has(found.userId)) {
          matched.set(found.userId, {
            contactName: item.name || found.fullname,
            contactPhone: item.phones[0],
            profile: found,
          });
        }
      } else {
        unregistered.push(item);
      }
    });

    const matchedIds = [...matched.keys()];
    const savedRaw = matchedIds.length
      ? await ContactModel.findAll({
          where: {
            userId: req.user._id,
            friendId: { [Op.in]: matchedIds },
          },
          attributes: ['friendId', 'roomId'],
        })
      : [];
    const savedMap = new Map(
      toPlainMany(savedRaw).map((contact) => [contact.friendId, contact])
    );

    const registered = matchedIds.map((userId) => {
      const item = matched.get(userId);
      return {
        ...item,
        isSaved: savedMap.has(userId),
        roomId: savedMap.get(userId)?.roomId || null,
      };
    });

    response({
      res,
      payload: {
        registered,
        unregistered,
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

const updateBlockedUsers = async (userId, friendId, shouldBlock) => {
  const setting = await SettingModel.findOne({ where: { userId } });
  const blocked = new Set(setting?.blockedUserIds || []);

  if (shouldBlock) blocked.add(friendId);
  else blocked.delete(friendId);

  if (setting) {
    await setting.update({ blockedUserIds: [...blocked] });
  } else {
    await SettingModel.create({
      userId,
      blockedUserIds: [...blocked],
    });
  }

  return [...blocked];
};

exports.blockState = async (req, res) => {
  try {
    const userId = req.user._id;
    const { friendId } = req.params;

    const [mySetting, friendSetting] = await Promise.all([
      SettingModel.findOne({
        where: { userId },
        attributes: ['blockedUserIds'],
      }),
      SettingModel.findOne({
        where: { userId: friendId },
        attributes: ['blockedUserIds'],
      }),
    ]);

    const myBlocked = toPlain(mySetting)?.blockedUserIds || [];
    const friendBlocked = toPlain(friendSetting)?.blockedUserIds || [];

    response({
      res,
      payload: {
        youBlocked: myBlocked.includes(friendId),
        blockedYou: friendBlocked.includes(userId),
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

exports.block = async (req, res) => {
  try {
    const { friendId } = req.params;
    const actorId = req.user._id;
    const blockedUserIds = await updateBlockedUsers(
      actorId,
      friendId,
      true
    );

    if (global?.io) {
      global.io.to(friendId).emit('contact/block-update', {
        actorId,
        targetId: friendId,
        blocked: true,
      });
      global.io.to(actorId).emit('contact/block-update', {
        actorId,
        targetId: friendId,
        blocked: true,
      });
    }

    response({
      res,
      message: 'Contact blocked',
      payload: { blockedUserIds },
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

exports.unblock = async (req, res) => {
  try {
    const { friendId } = req.params;
    const actorId = req.user._id;
    const blockedUserIds = await updateBlockedUsers(
      actorId,
      friendId,
      false
    );

    if (global?.io) {
      global.io.to(friendId).emit('contact/block-update', {
        actorId,
        targetId: friendId,
        blocked: false,
      });
      global.io.to(actorId).emit('contact/block-update', {
        actorId,
        targetId: friendId,
        blocked: false,
      });
    }

    response({
      res,
      message: 'Contact unblocked',
      payload: { blockedUserIds },
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
    const setting = await SettingModel.findOne({
      where: { userId: req.user._id },
      attributes: ['sortContactByName'],
    });

    const contactsRaw = await ContactModel.findAll({
      where: { userId: req.user._id },
    });
    const contacts = toPlainMany(contactsRaw);

    if (contacts.length === 0) {
      response({ res, payload: [] });
      return;
    }

    const friendIds = contacts.map((contact) => contact.friendId);
    const profiles = await ProfileModel.findAll({
      where: {
        userId: { [Op.in]: friendIds },
      },
    });
    const profileMap = new Map(
      toPlainMany(profiles).map((profile) => [profile.userId, profile])
    );

    const merged = contacts
      .map((contact) => ({
        ...contact,
        profile: profileMap.get(contact.friendId) || null,
      }))
      .filter((contact) => !!contact.profile);

    merged.sort((a, b) => {
      if (setting?.sortContactByName) {
        return (a.profile.fullname || '').localeCompare(
          b.profile.fullname || ''
        );
      }
      return (
        new Date(b.profile.updatedAt || 0).getTime() -
        new Date(a.profile.updatedAt || 0).getTime()
      );
    });

    response({
      res,
      payload: merged,
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

exports.deleteByFriendId = async (req, res) => {
  try {
    const { friendId } = req.params;
    await ContactModel.destroy({
      where: { userId: req.user._id, friendId },
    });

    response({
      res,
      message: 'Contact deleted successfully',
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
