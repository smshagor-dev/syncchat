import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { setModal } from '../../redux/features/modal';
import { setRefreshInbox } from '../../redux/features/chore';
import { setChatRoom } from '../../redux/features/room';

function ConfirmDeleteChatAndInbox() {
  const dispatch = useDispatch();
  const confirmDeleteChatAndInbox = useSelector(
    (state) => state.modal.confirmDeleteChatAndInbox
  );
  const chatRoom = useSelector((state) => state.room.chat);
  const [scope, setScope] = React.useState('self');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const roomType = chatRoom?.data?.roomType || 'private';
  const isGroup = roomType === 'group';
  const friendName = chatRoom?.data?.profile?.fullname || 'the other participant';

  React.useEffect(() => {
    if (confirmDeleteChatAndInbox) {
      setScope('self');
      setLoading(false);
      setError('');
    }
  }, [confirmDeleteChatAndInbox]);

  const emitLocalInboxDelete = (roomId) => {
    window.dispatchEvent(
      new CustomEvent('syncchat:inbox-delete', {
        detail: { roomId },
      })
    );
  };

  const closeModal = () =>
    dispatch(
      setModal({
        target: 'confirmDeleteChatAndInbox',
        data: false,
      })
    );

  const handleDeleteChatAndInbox = async () => {
    try {
      setLoading(true);
      setError('');
      await axios.delete(`/chats/${confirmDeleteChatAndInbox.roomId}`, {
        data: { scope },
      });
      emitLocalInboxDelete(confirmDeleteChatAndInbox.roomId);

      dispatch(setRefreshInbox(uuidv4()));

      if (
        chatRoom?.isOpen &&
        chatRoom?.data &&
        (confirmDeleteChatAndInbox.inboxId === chatRoom.data._id ||
          confirmDeleteChatAndInbox.roomId === chatRoom.data.roomId)
      ) {
        dispatch(
          setChatRoom({
            isOpen: false,
            refreshId: uuidv4(),
            data: null,
          })
        );
      }

      closeModal();
    } catch (error0) {
      setLoading(false);
      setError(error0?.response?.data?.message || error0.message);
    }
  };

  return (
    <div
      className={`
        ${
          confirmDeleteChatAndInbox
            ? 'delay-75 z-50'
            : '-z-50 opacity-0 delay-300'
        }
        absolute w-full h-full flex justify-center items-center
        bg-spill-600/40 dark:bg-black/60
      `}
    >
      <div
        aria-hidden
        className={`${
          !confirmDeleteChatAndInbox && 'scale-0'
        } transition relative w-[420px] max-w-[calc(100vw-2rem)] m-6 p-4 rounded-xl bg-white dark:bg-spill-800`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h1 className="text-2xl font-bold mb-1">Delete Chat</h1>
        <p className="text-sm opacity-70">
          Choose where this conversation should be removed.
        </p>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            className={`rounded-xl border p-4 text-left ${
              scope === 'self'
                ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/30'
                : 'border-slate-200 dark:border-spill-600'
            }`}
            onClick={() => setScope('self')}
          >
            <p className="font-semibold">Delete for me</p>
            <p className="mt-1 text-xs opacity-60">
              Only your copy is removed. The other participant keeps the chat.
            </p>
          </button>

          {!isGroup && (
            <button
              type="button"
              className={`rounded-xl border p-4 text-left ${
                scope === 'both'
                  ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/30'
                  : 'border-slate-200 dark:border-spill-600'
              }`}
              onClick={() => setScope('both')}
            >
              <p className="font-semibold text-rose-600 dark:text-rose-400">
                Delete for both
              </p>
              <p className="mt-1 text-xs opacity-60">
                Permanently remove the conversation for you and {friendName}.
              </p>
            </button>
          )}

          {error && (
            <p className="pt-1 text-sm text-rose-600 dark:text-rose-400">{error}</p>
          )}
        </div>

        <span className="mt-4 flex gap-2 justify-end">
          <button
            type="button"
            className="py-2 px-4 rounded-md hover:bg-gray-100 dark:hover:bg-spill-700"
            onClick={closeModal}
            disabled={loading}
          >
            <p>Cancel</p>
          </button>
          <button
            type="button"
            className="py-2 px-4 rounded-md text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
            onClick={handleDeleteChatAndInbox}
            disabled={loading}
          >
            <p className="font-bold">
              {loading
                ? 'Deleting...'
                : scope === 'both'
                  ? 'Delete for both'
                  : 'Delete for me'}
            </p>
          </button>
        </span>
      </div>
    </div>
  );
}

export default ConfirmDeleteChatAndInbox;
