(() => {
  const tauri = window.__TAURI__;
  if (!tauri) return;

  document.documentElement.dataset.syncchatDesktop = 'true';

  const desktop = {
    isDesktop: true,
    runtime: null,
    async notify(title, body) {
      const api = tauri.notification;
      if (!api) return false;
      let granted = await api.isPermissionGranted();
      if (!granted) {
        granted = (await api.requestPermission()) === 'granted';
      }
      if (!granted) return false;
      await api.sendNotification({ title, body });
      return true;
    },
    async setAutostart(enabled) {
      if (!tauri.autostart) return false;
      if (enabled) await tauri.autostart.enable();
      else await tauri.autostart.disable();
      return tauri.autostart.isEnabled();
    },
    async isAutostartEnabled() {
      return tauri.autostart ? tauri.autostart.isEnabled() : false;
    },
  };

  window.SyncChatDesktop = desktop;

  const showDesktopRoute = (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== 'syncchat:') return;

      const host = url.hostname.toLowerCase();
      const path = url.pathname.replace(/^\/+/, '');
      const route = host === 'chat' ? '/chat' : path === 'chat' ? '/chat' : '/chat';
      const next = `${route}${url.search || ''}`;
      const current = `${window.location.pathname}${window.location.search}`;
      if (current === next) return;
      window.history.pushState({}, '', next);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch (error) {
      console.warn('[SyncChat Desktop] Ignored invalid deep link.', error);
    }
  };

  const initDeepLinks = async () => {
    if (!tauri.deepLink) return;
    const current = await tauri.deepLink.getCurrent();
    if (Array.isArray(current)) current.forEach(showDesktopRoute);
    await tauri.deepLink.onOpenUrl((urls) => {
      if (Array.isArray(urls)) urls.forEach(showDesktopRoute);
    });
  };

  const initExternalLinks = () => {
    document.addEventListener('click', (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      if (!/^(https?:|mailto:|tel:)/i.test(href)) return;

      let external = true;
      try {
        const url = new URL(href, window.location.href);
        external = url.origin !== window.location.origin;
      } catch (_) {
        external = true;
      }
      if (!external || !tauri.opener) return;

      event.preventDefault();
      tauri.opener.openUrl(href).catch((error) => {
        console.warn('[SyncChat Desktop] Unable to open external URL.', error);
      });
    });
  };

  const init = async () => {
    try {
      desktop.runtime = await tauri.core.invoke('desktop_runtime_info');
    } catch (error) {
      console.warn('[SyncChat Desktop] Runtime info unavailable.', error);
    }

    initExternalLinks();
    try {
      await initDeepLinks();
    } catch (error) {
      console.warn('[SyncChat Desktop] Deep-link bridge unavailable.', error);
    }

    window.dispatchEvent(
      new CustomEvent('syncchat:desktop-ready', { detail: desktop.runtime }),
    );
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
