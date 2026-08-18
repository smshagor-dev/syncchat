import React from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app';

const removeLoginPasswordMinLength = () => {
  const passwordInput = document.querySelector('.auth-form input[type="password"]');
  if (passwordInput) passwordInput.removeAttribute('minlength');
};

const observer = new MutationObserver(removeLoginPasswordMinLength);
observer.observe(document.documentElement, { childList: true, subtree: true });

const root = ReactDOM.createRoot(document.querySelector('#admin-root'));
root.render(<App />);
removeLoginPasswordMinLength();
