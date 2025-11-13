export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('/service-worker.js');
        console.log('✅ Service Worker registered:', reg.scope);
      } catch (err) {
        console.warn('❌ Service Worker registration failed:', err);
      }
    });
  }
}
