import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import { savePendingUploadFile } from '../../helpers/pendingUploadFile';

const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.7z';
const AUDIO_ACCEPT = 'audio/*';
const MEDIA_ACCEPT = 'image/*,video/*';
const inferSendType = (file, forcedType = null) => {
  if (forcedType) return forcedType;

  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'photo';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
};

function AttachMenu({ composerText = '', onCaptionUsed = null }) {
  const dispatch = useDispatch();
  const {
    modal,
    room: { chat: chatRoom },
    user: { master, setting },
  } = useSelector((state) => state);

  const handleOpenPreview = async (selectedFiles, forcedType = null) => {
    if (!selectedFiles?.length || !chatRoom?.data) return;

    const files = Array.from(selectedFiles);
    const isGroup = chatRoom.data.roomType === 'group';
    const canSend =
      (!isGroup && chatRoom.data.profile?.active) ||
      (isGroup && chatRoom.data.group?.participantsId?.includes(master._id));
    const isBlocked =
      !isGroup &&
      setting?.blockedUserIds?.includes(chatRoom.data?.profile?.userId);
    if (!canSend || isBlocked) {
      // eslint-disable-next-line no-alert
      alert('You cannot send files in this room right now.');
      return;
    }
    const payloadItems = files.map((file) => {
      const fileToken = savePendingUploadFile(file);
      return {
        fileToken,
        originalname: file.name,
        size: file.size,
        url: URL.createObjectURL(file),
        type: inferSendType(file, forcedType),
      };
    });

    dispatch(
      setModal({
        target: 'sendFile',
        data: {
          items: payloadItems,
          caption: String(composerText || ''),
        },
      })
    );
  };

  const actions = [
    {
      key: 'documents',
      label: 'Documents',
      icon: <bi.BiFile />,
      iconClass:
        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
      input: { accept: DOC_ACCEPT },
      forceType: 'document',
      multiple: true,
    },
    {
      key: 'photos-videos',
      label: 'Photos & Video',
      icon: <bi.BiImageAlt />,
      iconClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
      input: { accept: MEDIA_ACCEPT },
      multiple: true,
    },
    {
      key: 'camera',
      label: 'Camera',
      icon: <bi.BiCamera />,
      iconClass:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      input: { accept: 'image/*', capture: 'environment' },
      forceType: 'photo',
    },
    {
      key: 'audio',
      label: 'Audio',
      icon: <bi.BiMicrophone />,
      iconClass:
        'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      input: { accept: AUDIO_ACCEPT, capture: 'user' },
      forceType: 'audio',
      multiple: true,
    },
    {
      key: 'contact',
      label: 'Contact',
      icon: <bi.BiUserCircle />,
      iconClass:
        'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
      onClick: () =>
        dispatch(setModal({ target: 'attachContact', data: true })),
    },
    {
      key: 'poll',
      label: 'Poll',
      icon: <bi.BiBarChartAlt2 />,
      iconClass:
        'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
      onClick: () => dispatch(setModal({ target: 'attachPoll', data: true })),
    },
    {
      key: 'event',
      label: 'Event',
      icon: <bi.BiCalendarEvent />,
      iconClass:
        'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
      onClick: () => dispatch(setModal({ target: 'attachEvent', data: true })),
    },
    {
      key: 'sticker',
      label: 'New Sticker',
      icon: <bi.BiSticker />,
      iconClass:
        'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
      onClick: () =>
        dispatch(setModal({ target: 'attachSticker', data: true })),
    },
  ];

  return (
    <div
      className={`${
        modal.attachMenu ? 'z-10' : 'scale-0 -z-10'
      } transition absolute left-0 bottom-0 w-[280px] p-3 rounded-2xl shadow-2xl translate-x-3 -translate-y-16 bg-white dark:bg-spill-800 border border-slate-200 dark:border-spill-700`}
      aria-hidden
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          if (action.input) {
            return (
              <label
                htmlFor={`attach-${action.key}`}
                key={action.key}
                className="p-2 rounded-xl cursor-pointer hover:bg-slate-100 dark:hover:bg-spill-700"
              >
                <span className="grid grid-cols-[auto_1fr] gap-2 items-center">
                  <i
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${action.iconClass}`}
                  >
                    {action.icon}
                  </i>
                  <span className="text-sm font-semibold leading-4">
                    {action.label}
                  </span>
                </span>
                <input
                  id={`attach-${action.key}`}
                  type="file"
                  accept={action.input.accept}
                  capture={action.input.capture}
                  multiple={Boolean(action.multiple)}
                  className="hidden"
                  onChange={async (e) => {
                    const input = e.target;
                    const selectedFiles = input.files;
                    if (selectedFiles?.length) {
                      await handleOpenPreview(
                        selectedFiles,
                        action.forceType || null
                      );
                    }
                    input.value = '';
                  }}
                />
              </label>
            );
          }

          return (
            <button
              key={action.key}
              type="button"
              className="p-2 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-spill-700"
              onClick={action.onClick}
            >
              <span className="grid grid-cols-[auto_1fr] gap-2 items-center">
                <i
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${action.iconClass}`}
                >
                  {action.icon}
                </i>
                <span className="text-sm font-semibold leading-4">
                  {action.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default AttachMenu;
