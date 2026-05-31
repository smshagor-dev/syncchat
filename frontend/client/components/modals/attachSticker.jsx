import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import socket from '../../helpers/socket';

const STICKERS = [
  '😀',
  '😂',
  '😍',
  '😎',
  '🥳',
  '🤯',
  '😴',
  '🤖',
  '👻',
  '🐼',
  '🦊',
  '🐸',
  '🐧',
  '🐯',
  '🦄',
  '🌈',
  '🔥',
  '⚡',
  '⭐',
  '🍕',
  '☕',
  '🎉',
  '💯',
  '❤️',
];

function AttachSticker() {
  const dispatch = useDispatch();
  const {
    modal: { attachSticker },
    room: { chat: chatRoom },
    user: { master, setting },
  } = useSelector((state) => state);

  const closeModal = () => {
    dispatch(setModal({ target: 'attachSticker', data: false }));
  };

  const canSendNow = () => {
    if (!chatRoom?.data) return false;
    const isGroup = chatRoom.data.roomType === 'group';
    const isBlocked =
      !isGroup &&
      setting?.blockedUserIds?.includes(chatRoom.data?.profile?.userId);
    const allowed =
      (!isGroup && chatRoom.data.profile?.active) ||
      (isGroup && chatRoom.data.group?.participantsId?.includes(master._id));
    return allowed && !isBlocked;
  };

  const sendSticker = (emoji) => {
    if (!canSendNow()) return;

    socket.emit('chat/insert', {
      roomId: chatRoom.data.roomId,
      userId: master._id,
      ownersId: chatRoom.data.ownersId,
      roomType: chatRoom.data.roomType,
      text: emoji,
      file: null,
      replyTo: null,
    });

    closeModal();
  };

  return (
    <div
      className={`${
        attachSticker ? 'delay-75 z-50' : '-z-50 opacity-0 delay-300'
      } absolute inset-0 flex justify-center items-center bg-spill-600/40 dark:bg-black/60`}
      aria-hidden
      onClick={closeModal}
    >
      <div
        aria-hidden
        className={`${
          !attachSticker && 'scale-0'
        } transition relative w-[420px] m-6 rounded-md overflow-hidden bg-white dark:bg-spill-800`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-spill-200 dark:border-spill-700">
          <h1 className="text-lg font-bold">New Sticker</h1>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
            onClick={closeModal}
          >
            <bi.BiX />
          </button>
        </div>

        <div className="p-3 grid grid-cols-6 gap-2">
          {STICKERS.map((sticker) => (
            <button
              key={sticker}
              type="button"
              className="h-14 rounded-xl text-3xl border border-spill-200 dark:border-spill-700 hover:bg-spill-100 dark:hover:bg-spill-700"
              onClick={() => sendSticker(sticker)}
            >
              {sticker}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AttachSticker;
