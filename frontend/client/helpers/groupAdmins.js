const asArray = (value) => (Array.isArray(value) ? value : []);

export const getGroupAdmins = (group) => {
  const admins = asArray(group?.adminsId).filter(Boolean);
  if (admins.length > 0) return [...new Set(admins)];
  if (group?.adminId) return [group.adminId];
  return [];
};

export const isGroupAdmin = (group, userId) =>
  !!userId && getGroupAdmins(group).includes(userId);
