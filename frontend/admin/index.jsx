import React from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app';
import ChatAiConfig from './chatAiConfig';
import { registerServiceWorker } from '../client/pwa/registerSW';
import { installProfilePasswordPanel } from './profilePassword';

const removeLoginPasswordMinLength = () => {
  const passwordInput = document.querySelector('.auth-form input[type="password"]');
  if (passwordInput) passwordInput.removeAttribute('minlength');
};

const observer = new MutationObserver(removeLoginPasswordMinLength);
observer.observe(document.documentElement, { childList: true, subtree: true });

const root = ReactDOM.createRoot(document.querySelector('#admin-root'));
root.render(
  <>
    <App />
    <ChatAiConfig />
  </>
);
removeLoginPasswordMinLength();
installProfilePasswordPanel();
registerServiceWorker();
