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

  const closeModal = () =>
    dispatch(
      setModal({
        target: 'confirmDeleteChatAndInbox',
        data: false,
      })
    );

  React.useEffect(() => {
    if (confirmDeleteChatAndInbox) {
      setScope('self');
      setLoading(false);
      setError('');
    }
  }, [confirmDeleteChatAndInbox]);

  React.useEffect(() => {
    if (!confirmDeleteChatAndInbox) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) closeModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmDeleteChatAndInbox, loading]);

  const emitLocalInboxDelete = (roomId) => {
    window.dispatchEvent(
      new CustomEvent('syncchat:inbox-delete', {
        detail: { roomId },
      })
    );
  };

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
        fixed inset-0 flex items-center justify-center p-4
        bg-spill-600/40 dark:bg-black/60
      `}
      onClick={(event) => {
        if (event.target !== event.currentTarget || loading) return;
        closeModal();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-chat-title"
        aria-describedby="delete-chat-description"
        className={`${
          !confirmDeleteChatAndInbox && 'scale-0'
        } transition relative w-full max-w-[420px] rounded-xl bg-white p-4 text-slate-900 shadow-2xl dark:bg-spill-800 dark:text-slate-100`}
        onClick={(event) => event.stopPropagation()}
      >
        <h1
          id="delete-chat-title"
          className="mb-1 text-2xl font-bold text-slate-900 dark:text-white"
        >
          Delete Chat
        </h1>
        <p
          id="delete-chat-description"
          className="text-sm text-slate-600 dark:text-slate-300"
        >
          Choose where this conversation should be removed.
        </p>

        <div className="mt-4 grid gap-2">
          <button
            type="button"
            aria-pressed={scope === 'self'}
            className={`min-h-[84px] w-full touch-manipulation select-none rounded-xl border p-4 text-left text-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:text-slate-100 dark:focus-visible:ring-offset-spill-800 ${
              scope === 'self'
                ? 'border-sky-500 bg-sky-50 dark:border-sky-400 dark:bg-sky-950/40'
                : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-spill-600 dark:bg-spill-800 dark:hover:bg-spill-700'
            }`}
            onClick={() => setScope('self')}
            disabled={loading}
          >
            <p className="font-semibold text-slate-900 dark:text-white">
              Delete for me
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
              Only your copy is removed. The other participant keeps the chat.
            </p>
          </button>

          {!isGroup && (
            <button
              type="button"
              aria-pressed={scope === 'both'}
              className={`min-h-[84px] w-full touch-manipulation select-none rounded-xl border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-spill-800 ${
                scope === 'both'
                  ? 'border-rose-500 bg-rose-50 dark:border-rose-400 dark:bg-rose-950/40'
                  : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-spill-600 dark:bg-spill-800 dark:hover:bg-spill-700'
              }`}
              onClick={() => setScope('both')}
              disabled={loading}
            >
              <p className="font-semibold text-rose-600 dark:text-rose-400">
                Delete for both
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
                Permanently remove the conversation for you and {friendName}.
              </p>
            </button>
          )}

          {error && (
            <p className="pt-1 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="min-h-[44px] touch-manipulation rounded-md px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-100 dark:hover:bg-spill-700 dark:focus-visible:ring-offset-spill-800"
            onClick={closeModal}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="min-h-[44px] touch-manipulation rounded-md bg-rose-600 px-4 py-2 font-bold text-white transition-colors hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-spill-800"
            onClick={handleDeleteChatAndInbox}
            disabled={loading}
          >
            {loading
              ? 'Deleting...'
              : scope === 'both'
                ? 'Delete for both'
                : 'Delete for me'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDeleteChatAndInbox;
