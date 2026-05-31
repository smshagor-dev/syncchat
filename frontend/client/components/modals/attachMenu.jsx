import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import { savePendingUploadFile } from '../../helpers/pendingUploadFile';
import config from '../../config';

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

function AttachMenu({
  composerText = '',
  onCaptionUsed = null,
  onSendLocation = null,
}) {
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

  const handleSendLocation = () => {
    if (typeof onSendLocation !== 'function') return;
    onSendLocation();
    dispatch(setModal({ target: 'attachMenu', data: false }));
  };

  const uploadsEnabled = config.featureFlags?.uploads !== false;
  const allowedTypes = Array.isArray(config.uploadAllowedTypes)
    ? config.uploadAllowedTypes
    : ['image', 'video', 'audio', 'document'];
  const allowImage = uploadsEnabled && allowedTypes.includes('image');
  const allowVideo = uploadsEnabled && allowedTypes.includes('video');
  const allowAudio = uploadsEnabled && allowedTypes.includes('audio');
  const allowDocument = uploadsEnabled && allowedTypes.includes('document');
  const mediaAccept =
    allowImage && allowVideo ? MEDIA_ACCEPT : allowImage ? 'image/*' : 'video/*';

  const actions = [
    allowDocument
      ? {
          key: 'documents',
          label: 'Documents',
          icon: <bi.BiFile />,
          iconClass:
            'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
          input: { accept: DOC_ACCEPT },
          forceType: 'document',
          multiple: true,
        }
      : null,
    allowImage || allowVideo
      ? {
          key: 'photos-videos',
          label: 'Photos & Video',
          icon: <bi.BiImageAlt />,
          iconClass: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
          input: { accept: mediaAccept },
          multiple: true,
        }
      : null,
    allowImage
      ? {
          key: 'camera',
          label: 'Camera',
          icon: <bi.BiCamera />,
          iconClass:
            'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
          input: { accept: 'image/*', capture: 'environment' },
          forceType: 'photo',
        }
      : null,
    allowAudio
      ? {
          key: 'audio',
          label: 'Audio',
          icon: <bi.BiMicrophone />,
          iconClass:
            'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
          input: { accept: AUDIO_ACCEPT, capture: 'user' },
          forceType: 'audio',
          multiple: true,
        }
      : null,
    {
      key: 'location',
      label: 'Location',
      icon: <bi.BiMapPin />,
      iconClass:
        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
      onClick: handleSendLocation,
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
  ].filter(Boolean);

  return (
    <div
      className={`${
        modal.attachMenu ? 'z-10' : 'scale-0 -z-10'
      } transition absolute left-0 bottom-0 w-[292px] p-3 rounded-[28px] shadow-[0_20px_55px_rgba(15,23,42,0.18)] translate-x-3 -translate-y-16 border border-slate-200/90 bg-white/98 backdrop-blur-xl dark:border-spill-700 dark:bg-spill-800/96`}
      aria-hidden
      onClick={(e) => e.stopPropagation()}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-spill-500">
            Attach
          </p>
          <p className="text-sm font-semibold text-slate-700 dark:text-spill-100">
            Share something
          </p>
        </span>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
          <bi.BiPlus />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {actions.map((action) => {
          if (action.input) {
            return (
              <label
                htmlFor={`attach-${action.key}`}
                key={action.key}
                className="cursor-pointer rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-spill-700 dark:bg-spill-900/80 dark:hover:border-spill-500 dark:hover:bg-spill-900"
              >
                <span className="grid grid-cols-[auto_1fr] gap-3 items-center">
                  <i
                    className={`h-10 w-10 rounded-2xl flex items-center justify-center shadow-sm ${action.iconClass}`}
                  >
                    {action.icon}
                  </i>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-4 text-slate-700 dark:text-spill-100">
                      {action.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-spill-400">
                      {action.key === 'photos-videos'
                        ? 'Gallery'
                        : action.key === 'documents'
                          ? 'PDF, ZIP, DOC'
                          : action.key}
                    </span>
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
              className="rounded-2xl border border-slate-200/80 bg-slate-50/90 p-3 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white dark:border-spill-700 dark:bg-spill-900/80 dark:hover:border-spill-500 dark:hover:bg-spill-900"
              onClick={action.onClick}
            >
              <span className="grid grid-cols-[auto_1fr] gap-3 items-center">
                <i
                  className={`h-10 w-10 rounded-2xl flex items-center justify-center shadow-sm ${action.iconClass}`}
                >
                  {action.icon}
                </i>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-4 text-slate-700 dark:text-spill-100">
                    {action.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-spill-400">
                    {action.key === 'location'
                      ? 'Live pin'
                      : action.key === 'contact'
                        ? 'Share card'
                        : action.key}
                  </span>
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
