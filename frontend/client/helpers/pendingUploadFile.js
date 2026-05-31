const pendingUploadFiles = new Map();

export const savePendingUploadFile = (file) => {
  const token = `upload_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  pendingUploadFiles.set(token, file);
  return token;
};

export const getPendingUploadFile = (token) => {
  if (!token) return null;
  return pendingUploadFiles.get(token) || null;
};

export const removePendingUploadFile = (token) => {
  if (!token) return;
  pendingUploadFiles.delete(token);
};
