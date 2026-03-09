import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';

function PhotoFull() {
  const dispatch = useDispatch();
  const photo = useSelector((state) => state.modal.photoFull);
  const photoUrl =
    typeof photo === 'string' ? photo : typeof photo?.url === 'string' ? photo.url : '';
  const kind =
    typeof photo === 'object' && photo !== null ? photo.kind || 'image' : 'image';
  const text =
    typeof photo === 'object' && photo !== null ? String(photo.text || '') : '';
  const allowDownload =
    typeof photo === 'object' && photo !== null
      ? photo.allowDownload !== false
      : true;
  const isOpen = kind === 'text' ? text.length > 0 : photoUrl.length > 0;

  return (
    <div
      className={`
        ${isOpen ? 'z-50 opacity-100 pointer-events-auto' : '-z-50 opacity-0 pointer-events-none'}
        fixed inset-0 grid grid-rows-[auto_1fr_auto] transition-opacity
        bg-spill-600/80 dark:bg-black/80
      `}
      aria-hidden
      onClick={() => dispatch(setModal({ target: 'photoFull', data: false }))}
    >
      <div className="h-16 px-2 flex justify-end items-center bg-spill-black/90">
        {isOpen && allowDownload && kind !== 'text' && (
          <a
            href={photoUrl}
            download
            className="p-2 mr-1 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
            onClick={(e) => e.stopPropagation()}
          >
            <i>
              <bi.BiDownload />
            </i>
          </a>
        )}
        <button
          type="button"
          className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
          onClick={() => dispatch(setModal({ target: 'photoFull', data: false }))}
        >
          <i>
            <bi.BiX />
          </i>
        </button>
      </div>
      <div className="flex justify-center items-center">
        {kind === 'text' ? (
          <div
            className="max-w-[92vw] rounded-3xl border border-slate-200 bg-white px-6 py-5 text-lg text-slate-800 shadow-2xl dark:border-spill-700 dark:bg-spill-900 dark:text-spill-100"
            onClick={(e) => e.stopPropagation()}
          >
            {text}
          </div>
        ) : kind === 'video' ? (
          <video
            src={isOpen ? photoUrl : ''}
            controls
            controlsList={allowDownload ? undefined : 'nodownload noplaybackrate noremoteplayback'}
            disablePictureInPicture={!allowDownload}
            className={`${isOpen ? 'scale-100' : 'scale-95'} transition max-w-[92vw] max-h-[78vh] object-contain`}
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
            src={isOpen ? photoUrl : ''}
            alt=""
            aria-hidden
            draggable={allowDownload}
            className={`${isOpen ? 'scale-100' : 'scale-95'} transition max-w-[92vw] max-h-[78vh] object-contain`}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              if (!allowDownload) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          />
        )}
      </div>
      <div className="h-16"></div>
    </div>
  );
}

export default PhotoFull;
