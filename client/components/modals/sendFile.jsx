import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import bytesToSize from '../../helpers/bytesToSize';
import { setReplyingChat } from '../../redux/features/chore';
import {
  getPendingUploadFile,
  removePendingUploadFile,
} from '../../helpers/pendingUploadFile';

const IMAGE_MIME_PREFIX = 'image/';

const toServerFileType = (sendType) => {
  if (sendType === 'photo') return 'image';
  if (sendType === 'video') return 'video';
  if (sendType === 'audio') return 'audio';
  return 'raw';
};

const inferStatusType = (sendType) => {
  if (sendType === 'photo') return 'photo';
  if (sendType === 'video') return 'video';
  return null;
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

const compressImageIfNeeded = (file) =>
  new Promise((resolve) => {
    if (!file?.type?.startsWith(IMAGE_MIME_PREFIX)) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 1600;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }

            resolve(new File([blob], file.name, { type: blob.type }));
          },
          'image/jpeg',
          0.82
        );
      };
      img.onerror = () => resolve(file);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });

function SendFile() {
  const dispatch = useDispatch();
  const {
    modal: { sendFile },
    room: { chat: chatRoom },
    chore: { replyingChat },
    user: { master, setting },
  } = useSelector((state) => state);

  const items = useMemo(() => {
    if (!sendFile) return [];
    if (Array.isArray(sendFile.items)) return sendFile.items;
    return [sendFile];
  }, [sendFile]);

  const [caption, setCaption] = useState(sendFile?.caption || '');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendStatus, setSendStatus] = useState('');
  const [previewIndex, setPreviewIndex] = useState(0);
  const [postToStatus, setPostToStatus] = useState(false);

  const activeItem = items[previewIndex] || null;
  const hasStatusEligibleItem = items.some(
    (item) => inferStatusType(item?.type) !== null
  );

  useEffect(() => {
    setCaption(sendFile?.caption || '');
    setPreviewIndex(0);
    setPostToStatus(false);
    setSendError('');
    setSendStatus('');
  }, [sendFile]);

  const closeModal = () => {
    items.forEach((item) => {
      if (item?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(item.url);
      }
      removePendingUploadFile(item?.fileToken);
    });
    setCaption('');
    setSendError('');
    setSendStatus('');
    setPreviewIndex(0);
    setPostToStatus(false);
    dispatch(setModal({ target: 'sendFile', data: false }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSending || !chatRoom?.data || items.length === 0) return;

    const isGroup = chatRoom.data.roomType === 'group';
    const canSend =
      (!isGroup && chatRoom.data.profile?.active) ||
      (isGroup && chatRoom.data.group?.participantsId?.includes(master._id));
    const isBlocked =
      !isGroup &&
      setting?.blockedUserIds?.includes(chatRoom.data?.profile?.userId);
    if (!canSend || isBlocked) {
      setSendError('You cannot send files in this room right now.');
      return;
    }

    try {
      setIsSending(true);
      setSendError('');
      const token = localStorage.getItem('token');
      const headers = token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const selectedName = item?.originalname || 'attachment';
        let selectedFile = getPendingUploadFile(item?.fileToken);
        if (!selectedFile && item?.url?.startsWith('blob:')) {
          const blob = await fetch(item.url).then((res) => res.blob());
          selectedFile = new File([blob], selectedName, {
            type: blob.type || 'application/octet-stream',
          });
        }
        if (!selectedFile) {
          throw new Error('Selected file could not be read. Please reselect.');
        }

        const preparedFile = await compressImageIfNeeded(selectedFile);
        const formData = new FormData();
        formData.append('file', preparedFile, selectedName);
        setSendStatus(`Uploading ${index + 1}/${items.length}...`);

        const uploadRes = await axios.post('/chats/upload', formData, {
          headers,
        });
        const uploaded = uploadRes?.data?.payload || null;
        if (!uploaded?.url) {
          throw new Error('Upload failed, no file URL returned');
        }

        setSendStatus(`Sending ${index + 1}/${items.length}...`);
        await axios.post(
          '/chats/send-file',
          {
            roomId: chatRoom.data.roomId,
            ownersId: chatRoom.data.ownersId,
            roomType: chatRoom.data.roomType,
            text: index === 0 ? caption : '',
            replyTo: replyingChat?._id || null,
            file: {
              ...uploaded,
              type: toServerFileType(item?.type),
            },
          },
          { headers }
        );

        if (postToStatus) {
          const statusType = inferStatusType(item?.type);
          if (statusType) {
            const mediaDataUrl = await fileToDataUrl(preparedFile);
            await axios.post(
              '/statuses',
              {
                type: statusType,
                text: index === 0 ? caption : '',
                mediaDataUrl,
              },
              { headers }
            );
          }
        }
      }

      setSendStatus('Sent successfully');
      dispatch(setReplyingChat(null));
      closeModal();
    } catch (error0) {
      const statusCode = error0?.response?.status;
      const backendMessage = error0?.response?.data?.message;
      const message = backendMessage || error0.message || 'Upload failed';
      setSendError(message);
      setSendStatus(
        statusCode ? `Failed with HTTP ${statusCode}` : 'Failed before response'
      );
      // eslint-disable-next-line no-console
      console.error('[sendFile]', message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className={`
        ${sendFile ? 'delay-75 z-50' : '-z-50 opacity-0 delay-300'}
        fixed inset-0 flex justify-center items-center
        bg-spill-600/40 dark:bg-black/60
      `}
      aria-hidden
      onClick={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div
        aria-hidden
        className={`${
          !sendFile && 'scale-0'
        } transition relative w-[520px] m-6 rounded-md overflow-hidden bg-white dark:bg-spill-800`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="h-14 pl-4 pr-2 flex gap-4 justify-between items-center">
          <h1 className="text-lg font-bold">
            {items.length > 1
              ? `Send ${items.length} files`
              : `Send ${activeItem?.type || 'file'}`}
          </h1>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
            onClick={(e) => {
              e.stopPropagation();
              closeModal();
            }}
          >
            <i>
              <bi.BiX />
            </i>
          </button>
        </div>

        {activeItem && (
          <div className="p-2">
            {activeItem.type === 'photo' && (
              <div className="p-2 flex justify-center items-center bg-spill-100 dark:bg-spill-950 rounded">
                <img src={activeItem.url} alt="" className="max-h-80" />
              </div>
            )}
            {activeItem.type === 'video' && (
              <div className="p-2 flex justify-center items-center bg-spill-100 dark:bg-spill-950 rounded">
                <video src={activeItem.url} controls className="max-h-80 max-w-full">
                  <track kind="captions" />
                </video>
              </div>
            )}
            {activeItem.type === 'audio' && (
              <div className="py-4 px-4 bg-spill-100 dark:bg-spill-950 rounded">
                <audio src={activeItem.url} controls className="w-full">
                  <track kind="captions" />
                </audio>
              </div>
            )}
            {activeItem.type === 'document' && (
              <div className="py-3 px-4 flex gap-4 items-center bg-spill-100 dark:bg-spill-950 rounded">
                <i>
                  <bi.BiFile size={40} />
                </i>
                <span className="truncate">
                  <p className="font-bold truncate">{activeItem.originalname}</p>
                  <p className="text-sm opacity-60 mt-0.5">
                    {bytesToSize(activeItem.size)}
                  </p>
                </span>
              </div>
            )}
          </div>
        )}

        {items.length > 1 && (
          <div className="px-4 pb-1 flex items-center justify-between text-sm">
            <button
              type="button"
              className="px-2 py-1 rounded hover:bg-spill-100 dark:hover:bg-spill-700 disabled:opacity-50"
              disabled={previewIndex <= 0}
              onClick={() => setPreviewIndex((prev) => Math.max(0, prev - 1))}
            >
              Prev
            </button>
            <span>
              {previewIndex + 1} / {items.length}
            </span>
            <button
              type="button"
              className="px-2 py-1 rounded hover:bg-spill-100 dark:hover:bg-spill-700 disabled:opacity-50"
              disabled={previewIndex >= items.length - 1}
              onClick={() =>
                setPreviewIndex((prev) => Math.min(items.length - 1, prev + 1))
              }
            >
              Next
            </button>
          </div>
        )}

        <form
          method="post"
          className="px-4 pb-3 grid gap-3"
          onSubmit={handleSubmit}
          encType="multipart/form-data"
        >
          <input
            type="text"
            name="caption"
            id="caption"
            autoComplete="off"
            placeholder="Type a message"
            className="w-full p-2 rounded border border-slate-200 dark:border-spill-700 bg-white dark:bg-spill-900"
            value={caption}
            onChange={(e) => {
              setCaption(e.target.value);
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={postToStatus}
              disabled={!hasStatusEligibleItem}
              onChange={(e) => setPostToStatus(e.target.checked)}
            />
            Post to status too
            {!hasStatusEligibleItem && (
              <span className="opacity-60">(only photo/video)</span>
            )}
          </label>
          <button
            type="submit"
            disabled={isSending}
            className="p-2 rounded-full w-10 h-10 grid place-items-center hover:bg-spill-100 dark:hover:bg-spill-700 disabled:opacity-60"
          >
            <i>
              {isSending ? (
                <bi.BiLoaderAlt className="animate-spin" />
              ) : (
                <bi.BiSend />
              )}
            </i>
          </button>
        </form>
        {sendError && (
          <p className="px-4 pb-3 text-xs text-rose-600 dark:text-rose-400">
            {sendError}
          </p>
        )}
        {sendStatus && (
          <p className="px-4 pb-3 text-xs text-slate-600 dark:text-spill-300">
            {sendStatus}
          </p>
        )}
      </div>
    </div>
  );
}

export default SendFile;
