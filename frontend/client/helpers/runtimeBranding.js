import axios from 'axios';
import config from '../config';
import { toStorageImageProxyUrl } from './storageImageUrl';

const setIconHref = (href) => {
  const value = String(href || '').trim() || '/pwa-192x192.png';
  let icon = document.querySelector('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement('link');
    icon.setAttribute('rel', 'icon');
    document.head.appendChild(icon);
  }
  icon.setAttribute('type', 'image/png');
  icon.setAttribute('href', value);
};

const applyRuntimeBranding = (payload = {}) => {
  if (payload.appName) {
    config.brandName = String(payload.appName || config.brandName);
    document.title = config.brandName;
  }

  const appLogo = String(payload.appLogo || '').trim();
  if (appLogo) {
    config.brandLogo = appLogo;
    setIconHref(toStorageImageProxyUrl(appLogo) || appLogo);
  } else {
    setIconHref('/pwa-192x192.png');
  }
};

const installRuntimeBranding = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  axios
    .get('/app-config', { baseURL: config.apiBaseUrl })
    .then(({ data }) => applyRuntimeBranding(data?.payload || {}))
    .catch(() => setIconHref('/pwa-192x192.png'));
};

export { applyRuntimeBranding };
export default installRuntimeBranding;
