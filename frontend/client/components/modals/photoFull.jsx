import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';
import { setRefreshAvatar } from '../../redux/features/chore';

function PhotoFull() {
  const dispatch = useDispatch();
  const photo = useSelector((state) => state.modal.photoFull);
  const photoUrl =
    typeof photo === 'string' ? photo : typeof photo?.url === 'string' ? photo.url : '';
  const kind =
    typeof photo === 'object' && photo !== null ? photo.kind || 'image' : 'image';
  const text =
    typeof photo === 'object' && photo !== null ? String(photo.text || '') : '';
  const poster =
    typeof photo === 'object' && photo !== null ? String(photo.poster || '') : '';
  const allowDownload =
    typeof photo === 'object' && photo !== null
      ? photo.allowDownload !== false
      : true;
  const isOpen = kind === 'text' ? text.length > 0 : photoUrl.length > 0;

  const [history, setHistory] = useState({
    matched: false,
    canDelete: false,
    currentAvatar: '',
    photos: [],
  });
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || kind !== 'image' || !photoUrl) {
      setHistory({
        matched: false,
        canDelete: false,
        currentAvatar: '',
        photos: [],
      });
      setHistoryIndex(0);
      return undefined;
    }

    const abortCtrl = new AbortController();
    setHistoryLoading(true);

    axios
      .get('/profile-photos', {
        params: { url: photoUrl },
        signal: abortCtrl.signal,
      })
      .then(({ data }) => {
        const payload = data?.payload || {};
        const photos = Array.isArray(payload.photos) ? payload.photos : [];
        const initialIndex = Math.max(
          0,
          photos.findIndex(
            (item) =>
              item?.url === photoUrl ||
              (payload.currentAvatar && item?.url === payload.currentAvatar)
          )
        );

        setHistory({
          matched: payload.matched === true,
          canDelete: payload.canDelete === true,
          currentAvatar: String(payload.currentAvatar || ''),
          photos,
        });
        setHistoryIndex(initialIndex);
      })
      .catch((error0) => {
        if (error0?.code !== 'ERR_CANCELED' && error0?.name !== 'CanceledError') {
          setHistory({
            matched: false,
            canDelete: false,
            currentAvatar: '',
            photos: [],
          });
          setHistoryIndex(0);
        }
      })
      .finally(() => setHistoryLoading(false));

    return () => abortCtrl.abort();
  }, [isOpen, kind, photoUrl]);

  const activeHistoryPhoto = useMemo(
    () => history.photos[historyIndex] || null,
    [history.photos, historyIndex]
  );
  const displayUrl = activeHistoryPhoto?.url || photoUrl;
  const historyCount = history.photos.length;

  const moveHistory = (delta) => {
    if (historyCount < 2) return;
    setHistoryIndex((current) => {
      const next = current + delta;
      if (next < 0) return historyCount - 1;
      if (next >= historyCount) return 0;
      return next;
    });
  };

  useEffect(() => {
    if (!isOpen || kind !== 'image' || historyCount < 2) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft') moveHistory(-1);
      if (event.key === 'ArrowRight') moveHistory(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, kind, historyCount]);

  const deleteProfilePhoto = async () => {
    if (!history.canDelete || !activeHistoryPhoto?._id || deleteLoading) return;
    const confirmed = window.confirm('Delete this profile photo?');
    if (!confirmed) return;

    try {
      setDeleteLoading(true);
      const { data } = await axios.delete(
        `/profile-photos/${activeHistoryPhoto._id}`
      );
      const payload = data?.payload || {};
      const photos = Array.isArray(payload.photos) ? payload.photos : [];
      const currentAvatar = String(payload.currentAvatar || '');

      dispatch(setRefreshAvatar(currentAvatar));

      if (!photos.length) {
        dispatch(setModal({ target: 'photoFull', data: false }));
        return;
      }

      const currentIndex = photos.findIndex(
        (item) => item?.url === currentAvatar
      );
      setHistory((prev) => ({
        ...prev,
        currentAvatar,
        photos,
      }));
      setHistoryIndex(
        currentIndex >= 0 ? currentIndex : Math.min(historyIndex, photos.length - 1)
      );
    } catch (error0) {
      window.alert(
        error0?.response?.data?.message || error0.message || 'Failed to delete photo'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div
      className={`
        ${isOpen ? 'z-50 opacity-100 pointer-events-auto' : '-z-50 opacity-0 pointer-events-none'}
        fixed inset-0 grid grid-rows-[auto_1fr_auto] transition-opacity
        bg-slate-950/84 backdrop-blur-md
      `}
      aria-hidden
      onClick={() => dispatch(setModal({ target: 'photoFull', data: false }))}
    >
      <div className="h-16 px-3 flex justify-end items-center">
        {history.canDelete && activeHistoryPhoto?._id && (
          <button
            type="button"
            className="mr-1 grid h-11 w-11 place-items-center rounded-full border border-rose-300/20 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
            aria-label="Delete profile photo"
            disabled={deleteLoading}
            onClick={(e) => {
              e.stopPropagation();
              deleteProfilePhoto();
            }}
          >
            {deleteLoading ? <bi.BiLoaderAlt className="animate-spin" /> : <bi.BiTrash />}
          </button>
        )}
        {isOpen && allowDownload && kind !== 'text' && (
          <a
            href={displayUrl}
            download
            className="mr-1 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            <bi.BiDownload />
          </a>
        )}
        <button
          type="button"
          className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/10 text-white hover:bg-white/15"
          onClick={() => dispatch(setModal({ target: 'photoFull', data: false }))}
        >
          <bi.BiX />
        </button>
      </div>
      <div className="relative flex justify-center items-center px-4">
        {kind === 'image' && historyCount > 1 && (
          <button
            type="button"
            aria-label="Previous profile photo"
            className="absolute left-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/35 text-2xl text-white hover:bg-black/55 sm:left-6"
            onClick={(e) => {
              e.stopPropagation();
              moveHistory(-1);
            }}
          >
            <bi.BiChevronLeft />
          </button>
        )}
        {kind === 'text' ? (
          <div
            className="max-w-[92vw] rounded-[28px] border border-white/10 bg-white px-6 py-5 text-lg text-slate-800 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {text}
          </div>
        ) : kind === 'video' ? (
          <video
            src={isOpen ? photoUrl : ''}
            poster={poster}
            controls
            controlsList={allowDownload ? undefined : 'nodownload noplaybackrate noremoteplayback'}
            disablePictureInPicture={!allowDownload}
            className={`${isOpen ? 'scale-100' : 'scale-95'} transition max-w-[92vw] max-h-[78vh] rounded-[28px] border border-white/10 bg-black object-contain shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              if (!allowDownload) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <track kind="captions" />
          </video>
        ) : (
          <img
            src={isOpen ? displayUrl : ''}
            alt=""
            aria-hidden
            draggable={allowDownload}
            className={`${isOpen ? 'scale-100' : 'scale-95'} transition max-w-[92vw] max-h-[78vh] rounded-[28px] border border-white/10 object-contain shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              if (!allowDownload) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          />
        )}
        {kind === 'image' && historyCount > 1 && (
          <button
            type="button"
            aria-label="Next profile photo"
            className="absolute right-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-black/35 text-2xl text-white hover:bg-black/55 sm:right-6"
            onClick={(e) => {
              e.stopPropagation();
              moveHistory(1);
            }}
          >
            <bi.BiChevronRight />
          </button>
        )}
      </div>
      <div className="h-16 flex items-start justify-center text-sm text-white/80">
        {kind === 'image' && historyCount > 0 ? (
          <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
            {historyIndex + 1} / {historyCount}
          </span>
        ) : historyLoading ? (
          <span className="flex items-center gap-2">
            <bi.BiLoaderAlt className="animate-spin" /> Checking profile photos…
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default PhotoFull;
