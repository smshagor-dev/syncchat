import config from '../config';

const normalizeApiBase = () => String(config.apiBaseUrl || '/api').replace(/\/+$/, '');

const isStorageProxyUrl = (value = '') =>
  String(value || '').includes('/storage/image?url=');

const isStoredUploadUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return false;

  try {
    const parsed = new URL(raw, window.location.origin);
    return /(?:^|\/)uploads\//i.test(parsed.pathname);
  } catch (error0) {
    return /(?:^|\/)uploads\//i.test(raw);
  }
};

const toStorageImageProxyUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw || !isStoredUploadUrl(raw) || isStorageProxyUrl(raw)) return '';
  return `${normalizeApiBase()}/storage/image?url=${encodeURIComponent(raw)}`;
};

export { isStoredUploadUrl, isStorageProxyUrl, toStorageImageProxyUrl };
