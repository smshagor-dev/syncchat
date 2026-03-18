/* global __APP_IS_DEV__ */

const isDev = typeof __APP_IS_DEV__ !== 'undefined' ? Boolean(__APP_IS_DEV__) : false;

export default {
  isDev,
  apiBaseUrl: '/api',
  socketUrl: '/',
  brandName: 'SyncChat Admin',
};
