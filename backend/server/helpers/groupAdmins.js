const { asArray, toPlain, addToSet, pullFromArray } = require('../db/utils');

const getGroupAdmins = (group) => {
  const plain = toPlain(group) || {};
  const explicitAdmins = asArray(plain.adminsId).filter(Boolean);
  if (explicitAdmins.length > 0) return [...new Set(explicitAdmins)];
  if (plain.adminId) return [plain.adminId];
  return [];
};

const isGroupAdminUser = ({ group, userId }) =>
  !!userId && getGroupAdmins(group).includes(userId);

const addGroupAdmin = ({ group, userId }) => {
  const current = getGroupAdmins(group);
  return addToSet(current, [userId]);
};

const removeGroupAdmin = ({ group, userId }) => {
  const current = getGroupAdmins(group);
  return pullFromArray(current, [userId]);
};

module.exports = {
  getGroupAdmins,
  isGroupAdminUser,
  addGroupAdmin,
  removeGroupAdmin,
};
