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
    event.preventDefault();
    deferredPrompt = event;
    window.dispatchEvent(new CustomEvent('syncchat:pwa-install-ready'));
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('syncchat:pwa-installed'));
  });
})();
