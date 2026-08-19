import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { setModal } from '../../redux/features/modal';
import socket from '../../helpers/socket';

function ConfirmDeleteChat() {
  const dispatch = useDispatch();

  const {
    chore: { selectedChats },
    modal: { confirmDeleteChat: confirmBox },
    room: { chat: chatRoom },
    user: { master },
  } = useSelector((state) => state);

  const [deleteForEveryone, setDeleteForEveryone] = useState(false);
  const [allSelectedMine, setAllSelectedMine] = useState(false);

  useEffect(() => {
    if (!confirmBox || !Array.isArray(selectedChats) || selectedChats.length === 0) {
      setAllSelectedMine(false);
      setDeleteForEveryone(false);
      return;
    }

    const mine = selectedChats.every((chatId) => {
      const node = document.querySelector(`#chat-msg-${chatId}`);
      return node?.getAttribute('data-owner-id') === master._id;
    });
    setAllSelectedMine(mine);
    if (!mine) setDeleteForEveryone(false);
  }, [confirmBox, selectedChats, master._id]);

  const canShowDeleteForEveryone = useMemo(
    () => allSelectedMine && Array.isArray(selectedChats) && selectedChats.length > 0,
    [allSelectedMine, selectedChats]
  );

  const closeModal = () => {
    dispatch(setModal({ target: 'confirmDeleteChat', data: false }));
    setTimeout(() => {
      setDeleteForEveryone(false);
    }, 150);
  };

  const handleDeleteChats = () => {
    socket.emit('chat/delete', {
      roomId: chatRoom.data.roomId,
      userId: master._id,
      chatsId: selectedChats,
      deleteForEveryone: canShowDeleteForEveryone ? deleteForEveryone : false,
    });
    dispatch(setModal({ target: 'confirmDeleteChat', data: false }));
  };

  return (
    <div
      className={`
        ${confirmBox ? 'delay-75 z-50' : '-z-50 opacity-0 delay-300'}
        fixed inset-0 flex items-center justify-center p-4
        bg-spill-600/40 dark:bg-black/60
      `}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        closeModal();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-message-title"
        aria-describedby="delete-message-description"
        className={`${
          !confirmBox && 'scale-0'
        } transition relative w-full max-w-[400px] rounded-xl bg-white p-4 text-slate-900 shadow-2xl dark:bg-spill-800 dark:text-slate-100`}
        onClick={(event) => event.stopPropagation()}
      >
        <h1
          id="delete-message-title"
          className="mb-1 text-2xl font-bold text-slate-900 dark:text-white"
        >
          Delete Message
        </h1>
        <p
          id="delete-message-description"
          className="text-sm text-slate-600 dark:text-slate-300"
        >
          {canShowDeleteForEveryone
            ? 'Choose how you want to delete your message(s).'
            : 'This message can only be deleted from your side.'}
        </p>

        {canShowDeleteForEveryone && (
          <label
            htmlFor="deleteForEveryone"
            className="my-4 flex min-h-[48px] touch-manipulation cursor-pointer select-none items-center gap-3 rounded-lg px-3 py-2 text-slate-800 transition-colors hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-spill-700"
          >
            <input
              type="checkbox"
              name="deleteForEveryone"
              id="deleteForEveryone"
              autoComplete="off"
              className="h-4 w-4 shrink-0 accent-rose-600"
              checked={deleteForEveryone}
              onChange={() => setDeleteForEveryone((prev) => !prev)}
            />
            <span className="font-medium">Delete for everyone</span>
          </label>
        )}

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="min-h-[44px] touch-manipulation rounded-md px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:text-slate-100 dark:hover:bg-spill-700 dark:focus-visible:ring-offset-spill-800"
            onClick={closeModal}
          >
            Cancel
          </button>
          <button
            type="button"
            className="min-h-[44px] touch-manipulation rounded-md bg-rose-600 px-4 py-2 font-bold text-white transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-spill-800"
            onClick={handleDeleteChats}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDeleteChat;
