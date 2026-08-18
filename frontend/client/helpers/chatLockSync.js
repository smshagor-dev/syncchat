import { v4 as uuidv4 } from 'uuid';
import socket from './socket';
import store from '../redux/store';
import { setRefreshInbox } from '../redux/features/chore';
import { setChatRoom } from '../redux/features/room';

let installed = false;

const installChatLockSync = () => {
  if (installed) return;
  installed = true;

  socket.on('inbox/chat-lock', (payload = {}) => {
    if (!payload?.roomId) return;

    const state = store.getState();
    const masterId = String(state?.user?.master?._id || '');
    const activeRoomId = state?.room?.chat?.data?.roomId;
    const lockedForCurrentUser =
      Array.isArray(payload?.chatLockBy) && payload.chatLockBy.includes(masterId);

    if (activeRoomId === payload.roomId && lockedForCurrentUser) {
      store.dispatch(
        setChatRoom({
          isOpen: false,
          refreshId: uuidv4(),
          data: null,
        })
      );
    }

    store.dispatch(setRefreshInbox(uuidv4()));
    window.dispatchEvent(
      new CustomEvent('syncchat:chat-lock-updated', {
        detail: payload,
      })
    );
  });
};

export default installChatLockSync;
