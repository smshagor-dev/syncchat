import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import moment from 'moment';
import * as bi from 'react-icons/bi';
import { setModal } from '../../redux/features/modal';

function Media() {
  const dispatch = useDispatch();
  const open = useSelector((state) => state.modal.media);

  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState([]);

  useEffect(() => {
    const abortCtrl = new AbortController();

    const getMedia = async () => {
      if (!open) {
        return;
      }

      try {
        setLoaded(false);
        const { data } = await axios.get('/chats/media', {
          signal: abortCtrl.signal,
        });
        setItems(data.payload || []);
      } catch (error0) {
        setItems([]);
        console.error(error0?.response?.data?.message || error0.message);
      } finally {
        setLoaded(true);
      }
    };

    getMedia();

    return () => abortCtrl.abort();
  }, [open]);

  return (
    <div
      className={`
        ${open ? 'delay-75 z-[60]' : '-z-50 opacity-0 delay-300'}
        absolute inset-0 w-full h-full flex justify-center items-center
        bg-spill-600/40 dark:bg-black/60
      `}
      aria-hidden
      onClick={() => dispatch(setModal({ target: 'media', data: false }))}
    >
      <div
        aria-hidden
        className={`
          ${!open && 'scale-0'}
          transition relative w-[820px] max-w-[94vw] h-[78vh] m-6 rounded-md overflow-hidden
          bg-white dark:bg-spill-800 grid grid-rows-[auto_1fr]
        `}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-14 px-4 flex items-center justify-between border-b border-spill-200 dark:border-spill-700">
          <h1 className="text-lg font-bold">Media</h1>
          <button
            type="button"
            className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-700"
            onClick={() => dispatch(setModal({ target: 'media', data: false }))}
          >
            <bi.BiX />
          </button>
        </div>

        <div className="p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
          {!loaded && (
            <div className="h-full flex justify-center items-center">
              <i className="animate-spin">
                <bi.BiLoaderAlt size={22} />
              </i>
            </div>
          )}

          {loaded && items.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-70">
              <bi.BiImageAlt size={46} />
              <p className="mt-2">No media found yet.</p>
            </div>
          )}

          {loaded && items.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {items.map((item) => (
                <div
                  key={item._id}
                  className="rounded-md overflow-hidden border border-spill-200 dark:border-spill-700 bg-spill-50 dark:bg-spill-900/40"
                >
                  {item.file.type === 'image' ? (
                    <img
                      src={item.file.url}
                      alt=""
                      className="w-full aspect-square object-cover cursor-pointer hover:brightness-90"
                      aria-hidden
                      onClick={() =>
                        dispatch(
                          setModal({
                            target: 'photoFull',
                            data: item.file.url,
                          })
                        )
                      }
                    />
                  ) : (
                    <video
                      src={item.file.url}
                      controls
                      className="w-full aspect-square object-cover bg-black"
                    >
                      <track kind="captions" />
                    </video>
                  )}
                  <div className="px-2 py-1.5 text-xs opacity-80 truncate">
                    {moment(item.createdAt).fromNow()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Media;
