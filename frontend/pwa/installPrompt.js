(() => {
  let deferredPrompt = null;

  const api = {
    get canInstall() {
      return Boolean(deferredPrompt);
    },
    async install() {
      if (!deferredPrompt) return { outcome: 'unavailable' };
      const prompt = deferredPrompt;
      deferredPrompt = null;
      await prompt.prompt();
      const choice = await prompt.userChoice;
      return choice || { outcome: 'dismissed' };
    },
  };

  window.SyncChatPWA = api;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Do not call preventDefault(): the browser remains free to expose its
    // native install affordance while we still retain the event for callers
    // that explicitly invoke window.SyncChatPWA.install().
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('syncchat:pwa-install-ready'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('syncchat:pwa-installed'));
  });
})();
