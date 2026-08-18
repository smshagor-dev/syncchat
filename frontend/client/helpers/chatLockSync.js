import { v4 as uuidv4 } from 'uuid';
import socket from './socket';
import store from '../redux/store';
import { setRefreshInbox } from '../redux/features/chore';

let installed = false;

const installChatLockSync = () => {
  if (installed) return;
  installed = true;

  socket.on('inbox/chat-lock', (payload = {}) => {
    if (!payload?.roomId) return;
    store.dispatch(setRefreshInbox(uuidv4()));
    window.dispatchEvent(
      new CustomEvent('syncchat:chat-lock-updated', {
        detail: payload,
      })
    );
  });
};

export default installChatLockSync;
