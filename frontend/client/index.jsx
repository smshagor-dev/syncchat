import React from 'react';
import * as ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import store from './redux/store';
import App from './app';
import GlobalCallLayer from './components/calling/globalCallLayer';
import GlobalChatTools from './components/chat/GlobalChatTools';
import installProfileAvatarSync from './helpers/profileAvatarSync';
import installChatLockSync from './helpers/chatLockSync';
import installChatDeletionSync from './helpers/chatDeletionSync';
import installChatTransportV2 from './helpers/chatTransportV2';
import installChatDraftV2 from './helpers/chatDraftV2';
import installTopicFilterV2 from './helpers/topicFilterV2';

import { registerServiceWorker } from './pwa/registerSW';
import { requestNotificationPermission } from './pwa/notifications';

const root = ReactDOM.createRoot(document.querySelector('#root'));

root.render(
  <Provider store={store}>
    <App />
    <GlobalCallLayer />
    <GlobalChatTools />
  </Provider>
);

installProfileAvatarSync();
installChatLockSync();
installChatDeletionSync();
installChatTransportV2();
installTopicFilterV2();
installChatDraftV2();
registerServiceWorker();

requestNotificationPermission();
