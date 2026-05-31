import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import bytesToSize from '../../helpers/bytesToSize';
import { setReplyingChat } from '../../redux/features/chore';
import config from '../../config';
import {
  getPendingUploadFile,
  removePendingUploadFile,
} from '../../helpers/pendingUploadFile';
import { replaceTextTokensWithEmoji } from '../../helpers/emojiText';

const IMAGE_MIME_PREFIX = 'image/';
const GOOGLE_DRIVE_URL = 'https://drive.google.com/drive/my-drive';

const toServerFileType = (sendType) => {
  if (sendType === 'photo') return 'image';
  if (sendType === 'video') return 'video';
  if (sendType === 'audio') return 'audio';
  return 'document';
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

const compressImageIfNeeded = (file, mediaQuality = 'standard') =>
  new Promise((resolve) => {
    if (!file?.type?.startsWith(IMAGE_MIME_PREFIX)) {
      resolve(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const isHd = String(mediaQuality || '').toLowerCase() === 'hd';
        const maxSide = isHd ? 2560 : 1600;
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
          isHd ? 0.92 : 0.82
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
  const [transferProgress, setTransferProgress] = useState({
    stage: '',
    current: 0,
    total: 0,
    progress: 0,
  });
  const [previewIndex, setPreviewIndex] = useState(0);
  const [postToStatus, setPostToStatus] = useState(false);
  const [viewOnce, setViewOnce] = useState(false);

  const activeItem = items[previewIndex] || null;
  const hasStatusEligibleItem = items.some(
    (item) => inferStatusType(item?.type) !== null
  );
  const oversizedItems = useMemo(
    () =>
      items.filter(
        (item) => Number(item?.size || 0) > Number(config.chatUploadLimit || 0)
      ),
    [items]
  );
  const hasOversizedItems = oversizedItems.length > 0;
  const maxUploadSizeLabel = bytesToSize(config.chatUploadLimit);

  useEffect(() => {
    setCaption(sendFile?.caption || '');
    setPreviewIndex(0);
    setPostToStatus(false);
    setViewOnce(false);
    setSendError('');
    setSendStatus('');
    setTransferProgress({
      stage: '',
      current: 0,
      total: 0,
      progress: 0,
    });
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
    setTransferProgress({
      stage: '',
      current: 0,
      total: 0,
      progress: 0,
    });
    setPreviewIndex(0);
    setPostToStatus(false);
    setViewOnce(false);
    dispatch(setModal({ target: 'sendFile', data: false }));
  };

  const openGoogleDrive = () => {
    window.open(GOOGLE_DRIVE_URL, '_blank', 'noopener,noreferrer');
  };

  const copyDriveReminder = async () => {
    const fileNames = oversizedItems
      .map((item) => item?.originalname)
      .filter(Boolean)
      .join(', ');
    const reminder = fileNames
      ? `This file is larger than SyncChat's ${maxUploadSizeLabel} limit. Upload ${fileNames} to Google Drive and paste the share link here.`
      : `This file is larger than SyncChat's ${maxUploadSizeLabel} limit. Upload it to Google Drive and paste the share link here.`;

    try {
      await navigator.clipboard.writeText(reminder);
      setSendStatus('Google Drive reminder copied. Paste it in chat after you get the share link.');
    } catch (error0) {
      setSendError('Could not copy the reminder. Open Google Drive and share the link manually.');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSending || !chatRoom?.data || items.length === 0) return;
    if (hasOversizedItems) {
      setSendError(
        `This file is larger than the ${maxUploadSizeLabel} upload limit. Upload it to Google Drive and share the link instead.`
      );
      return;
    }

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
      const processedCaption = setting?.replaceTextWithEmoji
        ? replaceTextTokensWithEmoji(caption)
        : caption;

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

        const preparedFile = await compressImageIfNeeded(
          selectedFile,
          setting?.mediaQuality
        );
        const formData = new FormData();
        formData.append('file', preparedFile, selectedName);
        setSendStatus(`Uploading ${index + 1}/${items.length}...`);
        setTransferProgress({
          stage: 'upload',
          current: index + 1,
          total: items.length,
          progress: 0,
        });

        const uploadRes = await axios.post('/chats/upload', formData, {
          headers,
          onUploadProgress: (event) => {
            const total = Number(event?.total || 0);
            const loaded = Number(event?.loaded || 0);
            const progress =
              total > 0 ? Math.round((loaded / total) * 100) : 0;
            setTransferProgress({
              stage: 'upload',
              current: index + 1,
              total: items.length,
              progress: Math.max(0, Math.min(100, progress)),
            });
          },
        });
        const uploaded = uploadRes?.data?.payload || null;
        if (!uploaded?.url) {
          throw new Error('Upload failed, no file URL returned');
        }

        setSendStatus(`Sending ${index + 1}/${items.length}...`);
        setTransferProgress({
          stage: 'send',
          current: index + 1,
          total: items.length,
          progress: 100,
        });
        await axios.post(
          '/chats/send-file',
          {
            roomId: chatRoom.data.roomId,
            ownersId: chatRoom.data.ownersId,
            roomType: chatRoom.data.roomType,
            text: index === 0 ? processedCaption : '',
            replyTo: replyingChat?._id || null,
            file: {
              ...uploaded,
              type: toServerFileType(item?.type),
            },
            viewOnce:
              viewOnce && ['photo', 'video'].includes(String(item?.type || '')),
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
                text: index === 0 ? processedCaption : '',
                mediaDataUrl,
              },
              { headers }
            );
          }
        }
      }

      setSendStatus('Sent successfully');
      setTransferProgress({
        stage: 'done',
        current: items.length,
        total: items.length,
        progress: 100,
      });
      dispatch(setReplyingChat(null));
      closeModal();
    } catch (error0) {
      const statusCode = error0?.response?.status;
      const backendMessage = error0?.response?.data?.message;
      const tooLarge =
        statusCode === 413 ||
        /too large|file too large|payload too large|limit/i.test(
          String(backendMessage || error0.message || '')
        );
      const message = tooLarge
        ? `This file is larger than the ${maxUploadSizeLabel} upload limit. Upload it to Google Drive and share the link instead.`
        : backendMessage || error0.message || 'Upload failed';
      setSendError(message);
      setSendStatus(
        tooLarge
          ? 'Upload blocked by file size limit'
          : statusCode
            ? `Failed with HTTP ${statusCode}`
            : 'Failed before response'
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
        } transition relative w-[560px] max-w-[calc(100vw-1.5rem)] m-3 rounded-[28px] overflow-hidden border border-slate-200 bg-white shadow-2xl dark:border-spill-700 dark:bg-spill-800`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="h-16 pl-5 pr-3 flex gap-4 justify-between items-center border-b border-slate-200/80 dark:border-spill-700">
          <h1 className="text-lg font-semibold tracking-tight">
            {items.length > 1
              ? `Send ${items.length} files`
              : `Send ${activeItem?.type || 'file'}`}
          </h1>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
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
          <div className="p-3">
            {activeItem.type === 'photo' && (
              <div className="flex justify-center items-center rounded-[22px] bg-spill-100 p-3 dark:bg-spill-950">
                <img src={activeItem.url} alt="" className="max-h-80 rounded-[18px]" />
              </div>
            )}
            {activeItem.type === 'video' && (
              <div className="flex justify-center items-center rounded-[22px] bg-spill-100 p-3 dark:bg-spill-950">
                <video src={activeItem.url} controls className="max-h-80 max-w-full rounded-[18px] bg-black">
                  <track kind="captions" />
                </video>
              </div>
            )}
            {activeItem.type === 'audio' && (
              <div className="rounded-[22px] bg-spill-100 px-4 py-4 dark:bg-spill-950">
                <audio src={activeItem.url} controls className="w-full">
                  <track kind="captions" />
                </audio>
              </div>
            )}
            {activeItem.type === 'document' && (
              <div className="flex items-center gap-4 rounded-[22px] bg-spill-100 px-4 py-4 dark:bg-spill-950">
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
          <div className="px-5 pb-1 flex items-center justify-between text-sm">
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
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-spill-700 dark:bg-spill-900"
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={viewOnce}
              disabled={!['photo', 'video'].includes(String(activeItem?.type || ''))}
              onChange={(e) => setViewOnce(e.target.checked)}
            />
            Send as 1-time view
            {!['photo', 'video'].includes(String(activeItem?.type || '')) && (
              <span className="opacity-60">(only photo/video)</span>
            )}
          </label>
          <button
            type="submit"
            disabled={isSending || hasOversizedItems}
            className="grid h-11 w-11 place-items-center rounded-full bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-60"
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
        {hasOversizedItems && (
          <div className="mx-4 mb-4 rounded-[22px] border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-900 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-100">
            <div className="flex items-start gap-3">
              <i className="mt-0.5 text-amber-600 dark:text-amber-300">
                <bi.BiCloudUpload size={20} />
              </i>
              <span className="min-w-0 flex-1">
                <p className="font-semibold">
                  File exceeds the SyncChat upload limit ({maxUploadSizeLabel})
                </p>
                <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-100/80">
                  Upload it to Google Drive, set sharing, then paste the share link in chat.
                </p>
                <div className="mt-2 space-y-1">
                  {oversizedItems.map((item) => (
                    <p
                      key={`${item.fileToken || item.originalname}-${item.size}`}
                      className="truncate text-xs"
                    >
                      {item.originalname} • {bytesToSize(item.size)}
                    </p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
                    onClick={openGoogleDrive}
                  >
                    Open Google Drive
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-100 dark:hover:bg-amber-900/40"
                    onClick={copyDriveReminder}
                  >
                    Copy Reminder
                  </button>
                </div>
              </span>
            </div>
          </div>
        )}
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
        {isSending && ['photo', 'video'].includes(String(activeItem?.type || '')) && (
          <div className="px-5 pb-5">
            <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-spill-700">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${transferProgress.progress || 0}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-spill-300">
              {transferProgress.stage === 'upload'
                ? `Uploading ${transferProgress.current}/${transferProgress.total}: ${transferProgress.progress}%`
                : transferProgress.stage === 'send'
                  ? `Finalizing message ${transferProgress.current}/${transferProgress.total}...`
                  : 'Processing...'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default SendFile;
