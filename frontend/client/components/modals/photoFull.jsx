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
  const poster =
    typeof photo === 'object' && photo !== null ? String(photo.poster || '') : '';
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
        bg-slate-950/84 backdrop-blur-md
      `}
      aria-hidden
      onClick={() => dispatch(setModal({ target: 'photoFull', data: false }))}
    >
      <div className="h-16 px-3 flex justify-end items-center">
        {isOpen && allowDownload && kind !== 'text' && (
          <a
            href={photoUrl}
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
      <div className="flex justify-center items-center px-4">
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
            src={isOpen ? photoUrl : ''}
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
      </div>
      <div className="h-16"></div>
    </div>
  );
}

export default PhotoFull;
