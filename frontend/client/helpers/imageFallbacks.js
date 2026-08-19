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
  const legacyFallback = getLegacyFallback(img);
  if (legacyFallback) return legacyFallback;

  const alt = String(img?.getAttribute?.('alt') || '')
    .trim()
    .toLowerCase();
  if (alt === 'syncchat') return '/pwa-192x192.png';

  return '';
};

const bindImage = (img) => {
  if (!(img instanceof HTMLImageElement)) return;

  const legacyFallback = getLegacyFallback(img);
  const current = String(img.getAttribute('src') || '');

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
    const fallback = getErrorFallback(img);
    if (!fallback) return;

    const active = String(img.getAttribute('src') || '');
    if (active.endsWith(fallback)) return;
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
