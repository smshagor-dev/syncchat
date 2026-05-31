const { asArray, toPlain } = require('../db/utils');
const { isGroupAdminUser } = require('./groupAdmins');

const DEFAULT_GROUP_PERMISSIONS = {
  memberCanEditInfo: false,
  memberCanSendMessage: true,
  memberCanAddMember: false,
  memberCanInviteViaLink: false,
  adminApprovalRequired: false,
};

const isChannelLike = (source) => {
  const plain = toPlain(source) || {};
  return (
    String(plain?.roomId || '').startsWith('channel-') ||
    String(plain?.link || '').startsWith('/channel/+')
  );
};

const normalizeGroupPermissions = (raw, options = {}) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const isChannel = !!options.isChannel;
  return {
    memberCanEditInfo: !!source.memberCanEditInfo,
    memberCanSendMessage:
      source.memberCanSendMessage === undefined
        ? !isChannel
        : !!source.memberCanSendMessage,
    memberCanAddMember: !!source.memberCanAddMember,
    memberCanInviteViaLink: !!source.memberCanInviteViaLink,
    adminApprovalRequired: !!source.adminApprovalRequired,
  };
};

const getGroupPermissions = (group) =>
  normalizeGroupPermissions(toPlain(group)?.permissions, {
    isChannel: isChannelLike(group),
  });

const canGroupMemberEditInfo = ({ group, userId }) => {
  const plain = toPlain(group) || {};
  if (isGroupAdminUser({ group: plain, userId })) return true;
  if (!asArray(plain.participantsId).includes(userId)) return false;
  return getGroupPermissions(plain).memberCanEditInfo;
};

const canGroupMemberAddOtherMember = ({ group, userId }) => {
  const plain = toPlain(group) || {};
  if (isGroupAdminUser({ group: plain, userId })) return true;
  if (!asArray(plain.participantsId).includes(userId)) return false;
  return getGroupPermissions(plain).memberCanAddMember;
};

const canGroupMemberSendMessage = ({ group, userId }) => {
  const plain = toPlain(group) || {};
  if (!asArray(plain.participantsId).includes(userId)) return false;
  if (isGroupAdminUser({ group: plain, userId })) return true;
  return getGroupPermissions(plain).memberCanSendMessage;
};

module.exports = {
  DEFAULT_GROUP_PERMISSIONS,
  normalizeGroupPermissions,
  getGroupPermissions,
  canGroupMemberEditInfo,
  canGroupMemberAddOtherMember,
  canGroupMemberSendMessage,
};
