import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import base64Encode from '../../helpers/base64Encode';
import config from '../../config';

function AvatarUpload() {
  const dispatch = useDispatch();
  const modal = useSelector((state) => state.modal);
  const refreshAvatar = useSelector((state) => state.chore.refreshAvatar);
  const uploadData =
    modal.avatarUpload && typeof modal.avatarUpload === 'object'
      ? modal.avatarUpload
      : { targetId: null, isGroup: false, isChannel: false };

  const [respond, setRespond] = useState({ success: true, message: null });
  const [currentAvatar, setCurrentAvatar] = useState('');
  const galleryInputRef = useRef(null);

  useEffect(() => {
    if (
      !modal.avatarUpload ||
      uploadData.isGroup ||
      uploadData.isChannel ||
      !uploadData.targetId
    ) {
      setCurrentAvatar('');
      return undefined;
    }

    const abortCtrl = new AbortController();
    axios
      .get(`/profiles/${uploadData.targetId}`, { signal: abortCtrl.signal })
      .then(({ data }) => setCurrentAvatar(String(data?.payload?.avatar || '')))
      .catch(() => {});
    return () => abortCtrl.abort();
  }, [
    modal.avatarUpload,
    uploadData.targetId,
    uploadData.isGroup,
    uploadData.isChannel,
  ]);

  const handleGallery = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) {
        return;
      }

      if (file.size >= config.avatarUploadLimit) {
        const maxMb = Math.round(config.avatarUploadLimit / (1024 * 1024));
        const errData = {
          message: `File too large. (max. ${maxMb} MB)`,
        };
        throw errData;
      }

      const base64 = await base64Encode(file);
      setRespond({ success: true, message: null });

      dispatch(
        setModal({
          target: 'imageCropper',
          data: {
            targetId: uploadData.targetId,
            isGroup: uploadData.isGroup,
            isChannel: uploadData.isChannel,
            src: base64,
            back: 'avatarUpload',
            backData: uploadData,
          },
        })
      );
      // allow selecting the same file again
      e.target.value = '';
    } catch (error0) {
      const message = error0?.message || 'Failed to process image';
      setRespond({
        success: false,
        message,
      });
    }
  };

  const openProfilePhotos = () => {
    const avatar = String(refreshAvatar || currentAvatar || '');
    if (!avatar) return;
    dispatch(setModal({ target: 'avatarUpload', data: false }));
    setTimeout(() => {
      dispatch(setModal({ target: 'photoFull', data: avatar }));
    }, 0);
  };

  const title = uploadData.isChannel
    ? 'Channel Photo'
    : uploadData.isGroup
      ? 'Group Photo'
      : 'Profile Photo';

  return (
    <div
      className={`
        ${
          modal.avatarUpload
            ? 'delay-75 z-[80] opacity-100 pointer-events-auto'
            : '-z-50 opacity-0 delay-300 pointer-events-none'
        }
        fixed inset-0 w-full h-full flex justify-center items-center
        bg-spill-600/40 dark:bg-black/60
      `}
    >
      <div
        aria-hidden
        className={`${
          !modal.avatarUpload && 'scale-0'
        } transition w-[460px] m-6 p-4 rounded-md bg-white dark:bg-spill-800`}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-3">
          <span>
            <h1 className="text-2xl font-bold">{title}</h1>
            {respond.message && (
              <p
                className={`mt-1 text-sm ${
                  !respond.success && 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {respond.message}
              </p>
            )}
          </span>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
            aria-label="Close avatar upload"
            onClick={() => {
              dispatch(setModal({ target: 'avatarUpload', data: false }));
            }}
          >
            <bi.BiX />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="w-full p-4 rounded-md cursor-pointer flex flex-col justify-center items-center bg-spill-100/60 dark:bg-spill-900/40 hover:bg-spill-200/80 dark:hover:bg-spill-900/80 border border-solid border-spill-400 dark:border-spill-600"
            onClick={() => {
              galleryInputRef.current?.click();
            }}
          >
            <i>
              <bi.BiImage size={40} />
            </i>
            <p className="mt-1 opacity-60">Gallery</p>
          </button>
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/png, image/jpg, image/jpeg, image/webp"
            name="avatar"
            id="gallery"
            className="hidden"
            onChange={handleGallery}
          />
          <button
            type="button"
            className="w-full p-4 rounded-md flex flex-col justify-center items-center bg-spill-100/60 dark:bg-spill-900/40 hover:bg-spill-200/80 dark:hover:bg-spill-900/80 border border-solid border-spill-400 dark:border-spill-600"
            onClick={() => {
              dispatch(
                setModal({
                  target: 'webcam',
                  data: {
                    back: 'avatarUpload',
                    backData: uploadData,
                    targetId: uploadData.targetId,
                    isGroup: uploadData.isGroup,
                    isChannel: uploadData.isChannel,
                  },
                })
              );
            }}
          >
            <i>
              <bi.BiCamera size={40} />
            </i>
            <p className="mt-1 opacity-60">Camera</p>
          </button>
          {!uploadData.isGroup && !uploadData.isChannel && (
            <button
              type="button"
              className="col-span-2 w-full p-3 rounded-md flex gap-3 justify-center items-center bg-spill-100/60 dark:bg-spill-900/40 hover:bg-spill-200/80 dark:hover:bg-spill-900/80 border border-solid border-spill-400 dark:border-spill-600 disabled:opacity-50"
              disabled={!String(refreshAvatar || currentAvatar || '')}
              onClick={openProfilePhotos}
            >
              <bi.BiImages size={24} />
              <span className="font-semibold">View profile photos</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AvatarUpload;
