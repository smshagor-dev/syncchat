import { toStorageImageProxyUrl } from './storageImageUrl';

const FALLBACKS = [
  {
    match: /(?:default-group-avatar\.png|\/assets\/icons\/group-avatar\.svg)(?:[?#].*)?$/i,
    target: '/assets/icons/group-avatar.svg',
  },
  {
    match: /(?:default-channel-avatar\.png|\/assets\/icons\/channel-avatar\.svg)(?:[?#].*)?$/i,
    target: '/assets/icons/channel-avatar.svg',
  },
  {
    match: /(?:default-avatar\.png|syncchat\.smshagor\.com\/uploads\/avatar\.jpg|\/assets\/icons\/user-avatar\.svg)(?:[?#].*)?$/i,
    target: '/assets/icons/user-avatar.svg',
  },
];

const getLegacyFallback = (img) => {
  const raw = String(img?.getAttribute?.('src') || '').trim();
  const match = FALLBACKS.find((item) => item.match.test(raw));
  return match?.target || '';
};

const getErrorFallback = (img) => {
  const original = String(img?.dataset?.syncchatOriginalSrc || '').trim();
  const legacyFallback = getLegacyFallback(img);
  if (legacyFallback) return legacyFallback;

  const alt = String(img?.getAttribute?.('alt') || '')
    .trim()
    .toLowerCase();
  if (alt === 'syncchat') return '/pwa-192x192.png';

  if (/(?:^|\/)uploads\/avatars\//i.test(original)) {
    return '/assets/icons/user-avatar.svg';
  }

  return '';
};

const bindImage = (img) => {
  if (!(img instanceof HTMLImageElement)) return;

  const current = String(img.getAttribute('src') || '');
  if (current && !img.dataset.syncchatOriginalSrc) {
    img.dataset.syncchatOriginalSrc = current;
  }

  const legacyFallback = getLegacyFallback(img);
  if (
    legacyFallback &&
    current &&
    !current.startsWith('data:') &&
    !current.endsWith(legacyFallback)
  ) {
    img.src = legacyFallback;
  }

  if (img.dataset.syncchatFallbackBound === '1') return;
  img.dataset.syncchatFallbackBound = '1';

  img.addEventListener('error', () => {
    const active = String(img.getAttribute('src') || '').trim();
    const original = String(img.dataset.syncchatOriginalSrc || active).trim();

    if (img.dataset.syncchatStorageProxyTried !== '1') {
      const proxyUrl = toStorageImageProxyUrl(original);
      if (proxyUrl && proxyUrl !== active) {
        img.dataset.syncchatStorageProxyTried = '1';
        img.src = proxyUrl;
        return;
      }
    }

    const fallback = getErrorFallback(img);
    if (!fallback || active.endsWith(fallback)) return;
    img.src = fallback;
  });
};

const scanImages = (root = document) => {
  if (root instanceof HTMLImageElement) bindImage(root);
  root.querySelectorAll?.('img').forEach(bindImage);
};

const installImageFallbacks = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  scanImages(document);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes') {
        bindImage(mutation.target);
        return;
      }

      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) scanImages(node);
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['src'],
  });

  return () => observer.disconnect();
};

export default installImageFallbacks;
