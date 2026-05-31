/* global __APP_IS_DEV__, __API_BASE_URL__, __SOCKET_URL__, __PUBLIC_ORIGIN__, __ADMIN_API_BASE_URL__, __ADMIN_SOCKET_URL__, __ADMIN_PUBLIC_ORIGIN__ */

const isDev = typeof __APP_IS_DEV__ !== 'undefined' ? Boolean(__APP_IS_DEV__) : false;
const configuredApiBaseUrl =
  typeof __ADMIN_API_BASE_URL__ !== 'undefined'
    ? String(__ADMIN_API_BASE_URL__ || '').trim()
    : typeof __API_BASE_URL__ !== 'undefined'
      ? String(__API_BASE_URL__ || '').trim()
      : '';
const configuredSocketUrl =
  typeof __ADMIN_SOCKET_URL__ !== 'undefined'
    ? String(__ADMIN_SOCKET_URL__ || '').trim()
    : typeof __SOCKET_URL__ !== 'undefined'
      ? String(__SOCKET_URL__ || '').trim()
      : '';
const configuredPublicOrigin =
  typeof __ADMIN_PUBLIC_ORIGIN__ !== 'undefined'
    ? String(__ADMIN_PUBLIC_ORIGIN__ || '').trim()
    : typeof __PUBLIC_ORIGIN__ !== 'undefined'
      ? String(__PUBLIC_ORIGIN__ || '').trim()
      : '';

const getOrigin = (value) => {
  if (!value) return '';

  try {
    return new URL(value, window.location.origin).origin;
  } catch (error0) {
    return '';
  }
};

const apiBaseUrl = configuredApiBaseUrl || '/api';
const socketUrl = configuredSocketUrl || '/';
const publicOrigin = configuredPublicOrigin || getOrigin(apiBaseUrl) || '';

export default {
  isDev,
  apiBaseUrl,
  socketUrl,
  publicOrigin,
  brandName: 'SyncChat Admin',
};
