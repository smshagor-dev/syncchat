export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    window.addEventListener('load', async () => {
      try {
        // Disable SW in local development to avoid caching/offline intercept issues.
        if (isLocalhost) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.unregister()));
          console.log('Service Worker disabled in development');
          return;
        }

        const reg = await navigator.serviceWorker.register(
          '/service-worker.js'
        );
        console.log('Service Worker registered:', reg.scope);
      } catch (err) {
        console.warn('Service Worker registration failed:', err);
      }
    });
  }
}
