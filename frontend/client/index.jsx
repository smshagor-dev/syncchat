import React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import store from './redux/store';
import App from './app';
import GlobalCallLayer from './components/calling/globalCallLayer';

import { registerServiceWorker } from './pwa/registerSW';
import { requestNotificationPermission } from './pwa/notifications';

const root = ReactDOM.createRoot(document.querySelector('#root'));

root.render(
  <Provider store={store}>
    <App />
    <GlobalCallLayer />
  </Provider>
);

registerServiceWorker();

requestNotificationPermission();
