const isDev = process.env.NODE_ENV === 'development';

export default {
  isDev,
  apiBaseUrl: '/api',
  socketUrl: '/',
  brandName: 'SyncChat',
  avatarUploadLimit: 10 * 1024 * 1024, // 10 MB
};
