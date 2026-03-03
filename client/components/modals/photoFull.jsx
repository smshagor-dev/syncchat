import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';

function PhotoFull() {
  const dispatch = useDispatch();
  const photo = useSelector((state) => state.modal.photoFull);
  const isOpen = typeof photo === 'string' && photo.length > 0;

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
        {isOpen && (
          <a
            href={photo}
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
        <img
          src={isOpen ? photo : ''}
          alt=""
          aria-hidden
          className={`${isOpen ? 'scale-100' : 'scale-95'} transition max-w-[92vw] max-h-[78vh] object-contain`}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="h-16"></div>
    </div>
  );
}

export default PhotoFull;
