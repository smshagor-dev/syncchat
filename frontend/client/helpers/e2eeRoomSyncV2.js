import { v4 as uuidv4 } from 'uuid';
import socket from './socket';
import store from '../redux/store';
import { setChatRoom } from '../redux/features/room';
import { setRefreshInbox } from '../redux/features/chore';

let installed = false;

const installE2eeRoomSyncV2 = () => {
  if (installed) return;
  installed = true;

  socket.on('e2ee/room', (payload = {}) => {
    if (!payload?.roomId) return;
    const state = store.getState();
    const chat = state?.room?.chat;
    if (chat?.isOpen && chat?.data?.roomId === payload.roomId) {
      store.dispatch(
        setChatRoom({
          ...chat,
          refreshId: uuidv4(),
          data: {
            ...chat.data,
            e2eeEnabled: !!payload.enabled,
            e2eeEnabledBy: payload.enabledBy || null,
            e2eeVersion: Number(payload.version || 0),
          },
        })
      );
    }
    store.dispatch(setRefreshInbox(uuidv4()));
    window.dispatchEvent(
      new CustomEvent('syncchat:e2ee-room-changed', { detail: payload })
    );
  });

  socket.on('e2ee/key-changed', (payload = {}) => {
    window.dispatchEvent(
      new CustomEvent('syncchat:e2ee-key-changed', { detail: payload })
    );
  });
};

export default installE2eeRoomSyncV2;
