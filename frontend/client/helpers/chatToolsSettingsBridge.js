const FLOATING_BUTTON_SELECTOR = 'button[title^="Chat tools"]';
const LAUNCHER_ID = 'syncchat-chat-tools-settings-launcher';

const hideFloatingLauncher = () => {
  const button = document.querySelector(FLOATING_BUTTON_SELECTOR);
  if (!button) return null;
  button.classList.add('syncchat-chat-tools-floating-hidden');
  button.setAttribute('aria-hidden', 'true');
  button.tabIndex = -1;
  return button;
};

const findOpenChatsSettingsPanel = () => {
  const heading = [...document.querySelectorAll('h2')].find(
    (node) => String(node.textContent || '').trim() === 'Chats'
  );
  if (!heading) return null;

  const panel = heading.closest('div[aria-hidden]');
  if (!panel || panel.getAttribute('aria-hidden') === 'true') return null;
  return panel;
};

const createLauncher = () => {
  const button = document.createElement('button');
  button.id = LAUNCHER_ID;
  button.type = 'button';
  button.className = 'syncchat-chat-tools-settings-card';
  button.setAttribute('aria-label', 'Open chat tools');

  const icon = document.createElement('span');
  icon.className = 'syncchat-chat-tools-settings-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '⌘';

  const copy = document.createElement('span');
  copy.className = 'syncchat-chat-tools-settings-copy';

  const title = document.createElement('p');
  title.className = 'syncchat-chat-tools-settings-title';
  title.textContent = 'Chat tools';

  const description = document.createElement('p');
  description.className = 'syncchat-chat-tools-settings-desc';
  description.textContent =
    'Search, requests, mentions, topics, security and outbox tools.';

  const arrow = document.createElement('span');
  arrow.className = 'syncchat-chat-tools-settings-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '›';

  copy.append(title, description);
  button.append(icon, copy, arrow);

  button.addEventListener('click', () => {
    const floatingButton = hideFloatingLauncher();
    if (floatingButton) {
      floatingButton.click();
    }
  });

  return button;
};

const syncLauncher = () => {
  hideFloatingLauncher();

  const panel = findOpenChatsSettingsPanel();
  if (!panel) return;

  const content = panel.querySelector('.mx-auto.grid.max-w-2xl.gap-4');
  if (!content || content.querySelector(`#${LAUNCHER_ID}`)) return;

  content.prepend(createLauncher());
};

const installChatToolsSettingsBridge = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  syncLauncher();

  let queued = false;
  const queueSync = () => {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      syncLauncher();
    });
  };

  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-hidden'],
  });

  window.addEventListener('popstate', queueSync);

  return () => {
    observer.disconnect();
    window.removeEventListener('popstate', queueSync);
  };
};

export default installChatToolsSettingsBridge;
