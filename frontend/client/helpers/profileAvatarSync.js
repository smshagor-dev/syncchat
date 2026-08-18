import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import socket from './socket';
import store from '../redux/store';
import {
  setRefreshAvatar,
  setRefreshContact,
  setRefreshFriendProfile,
  setRefreshInbox,
} from '../redux/features/chore';

let installed = false;

const refreshOwnAvatar = async (userId) => {
  try {
    const { data } = await axios.get(`/profiles/${userId}`);
    const avatar = String(data?.payload?.avatar || '');
    if (avatar) {
      store.dispatch(setRefreshAvatar(avatar));
    }
  } catch (error0) {
    // Other invalidation signals still make the UI refetch naturally.
  }
};

const installProfileAvatarSync = () => {
  if (installed) return;
  installed = true;

  socket.on('profile/avatar-changed', (event = {}) => {
    const changedUserId = String(event?.userId || '');
    if (!changedUserId) return;

    const masterId = String(store.getState()?.user?.master?._id || '');
    const refreshId = uuidv4();

    store.dispatch(setRefreshContact(refreshId));
    store.dispatch(setRefreshFriendProfile(refreshId));
    store.dispatch(setRefreshInbox(refreshId));

    if (masterId && changedUserId === masterId) {
      refreshOwnAvatar(masterId);
    }

    window.dispatchEvent(
      new CustomEvent('syncchat:profile-avatar-changed', {
        detail: {
          userId: changedUserId,
          at: event?.at || new Date().toISOString(),
        },
      })
    );
  });
};

export default installProfileAvatarSync;
