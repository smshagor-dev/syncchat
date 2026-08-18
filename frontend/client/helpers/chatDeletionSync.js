import { v4 as uuidv4 } from 'uuid';
import socket from './socket';
import store from '../redux/store';
import { setChatRoom } from '../redux/features/room';
import { setRefreshInbox } from '../redux/features/chore';

let installed = false;

const installChatDeletionSync = () => {
  if (installed) return;
  installed = true;

  socket.on('inbox/delete', (roomsId = []) => {
    const deletedRooms = Array.isArray(roomsId) ? roomsId : [];
    if (!deletedRooms.length) return;

    const state = store.getState();
    const activeRoomId = state?.room?.chat?.data?.roomId;
    if (activeRoomId && deletedRooms.includes(activeRoomId)) {
      store.dispatch(
        setChatRoom({
          isOpen: false,
          refreshId: uuidv4(),
          data: null,
        })
      );
    }

    store.dispatch(setRefreshInbox(uuidv4()));
  });
};

export default installChatDeletionSync;
