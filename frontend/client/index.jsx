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
import installRealtimeDelivery from './helpers/realtimeDelivery';
import installChatDraftV2 from './helpers/chatDraftV2';
import installTopicFilterV2 from './helpers/topicFilterV2';
import installChatHttpReliability from './helpers/chatHttpReliability';
import installMentionAutocompleteV2 from './helpers/mentionAutocompleteV2';
import installChatToolsSettingsBridge from './helpers/chatToolsSettingsBridge';
import installInboxModalNavigationGuard from './helpers/inboxModalNavigationGuard';
import installImageFallbacks from './helpers/imageFallbacks';
import installRuntimeBranding from './helpers/runtimeBranding';
import './styles/chatToolsTheme.css';
import './styles/layoutFixes.css';
import './styles/callScreenTheme.css';
import './styles/inboxMenuMobile.css';
import './styles/desktopMessenger.css';
import './styles/desktopPages.css';
import './styles/webDesktopParity.css';

import { registerServiceWorker } from './pwa/registerSW';

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
installChatHttpReliability();
installChatTransportV2();
installRealtimeDelivery();
installTopicFilterV2();
installChatDraftV2();
installMentionAutocompleteV2();
installChatToolsSettingsBridge();
installInboxModalNavigationGuard();
installImageFallbacks();
installRuntimeBranding();
registerServiceWorker();