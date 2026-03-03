import { createSlice } from '@reduxjs/toolkit';

const ModalSlice = createSlice({
  name: 'modal',
  initialState: {
    minibox: false,
    signout: false,
    newcontact: false,
    changePass: false,
    deleteAcc: false,
    qr: false,
    newGroup: false,
    avatarUpload: false,
    imageCropper: false, // -> { src: String, back: String | null }
    webcam: false, // -> { back: String }
    photoFull: false,
    confirmDeleteChat: false,
    sendFile: false,
    attachMenu: false,
    attachContact: false,
    attachPoll: false,
    attachEvent: false,
    attachSticker: false,
    confirmAddParticipant: false,
    roomHeaderMenu: false,
    editGroup: false,
    feedback: false,
    media: false,
    confirmExitGroup: false,
    confirmDeleteContact: false,
    inboxMenu: false,
    confirmDeleteChatAndInbox: false,
    groupContextMenu: false,
    shareContact: false,
    callPanel: false,
    callStart: false,
    roomAppearance: false,
  },
  reducers: {
    /* eslint-disable no-param-reassign */
    setModal(state, action) {
      const { target = '*', data = null } = action.payload;

      if (target) {
        Object.keys(state).forEach((key) => {
          if (target === key) {
            state[target] = data ?? !state[target];
          } else {
            state[key] = false;
          }
        });
      }
    },
    /* eslint-enable no-param-reassign */
  },
});

export const { setModal } = ModalSlice.actions;
export default ModalSlice.reducer;
