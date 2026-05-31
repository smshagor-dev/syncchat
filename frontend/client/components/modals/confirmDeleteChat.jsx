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
      aria-hidden
      className={`
        ${confirmBox ? 'delay-75 z-50' : '-z-50 opacity-0 delay-300'}
        fixed inset-0 flex justify-center items-center
        bg-spill-600/40 dark:bg-black/60
      `}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        dispatch(setModal({ target: 'confirmDeleteChat', data: false }));
        setTimeout(() => {
          setDeleteForEveryone(false);
        }, 150);
      }}
    >
      <div
        aria-hidden
        className={`${
          !confirmBox && 'scale-0'
        } transition relative w-[400px] m-6 p-4 rounded-md bg-white dark:bg-spill-800`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h1 className="text-2xl font-bold mb-1">Delete Message</h1>
        <p>
          {canShowDeleteForEveryone
            ? 'Choose how you want to delete your message(s).'
            : 'This message can only be deleted from your side.'}
        </p>
        {canShowDeleteForEveryone && (
          <label
            htmlFor="deleteForEveryone"
            className="my-4 flex gap-2 items-center cursor-pointer"
          >
            <input
              type="checkbox"
              name="deleteForEveryone"
              id="deleteForEveryone"
              autoComplete="off"
              checked={deleteForEveryone}
              onChange={() => setDeleteForEveryone((prev) => !prev)}
            />
            <p>Delete for everyone</p>
          </label>
        )}
        <span className="flex gap-2 justify-end">
          {[
            {
              label: 'Cancel',
              style: 'hover:bg-gray-100 dark:hover:bg-spill-700',
              action: () => {
                dispatch(setModal({ target: 'confirmDeleteChat', data: false }));
                setTimeout(() => {
                  setDeleteForEveryone(false);
                }, 150);
              },
            },
            {
              label: 'Delete',
              style: 'font-bold text-white bg-rose-600 hover:bg-rose-700',
              action: () => handleDeleteChats(),
            },
          ].map((elem) => (
            <button
              key={elem.label}
              type="button"
              className={`${elem.style} py-2 px-4 rounded-md`}
              onClick={() => elem.action()}
            >
              <p>{elem.label}</p>
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

export default ConfirmDeleteChat;
