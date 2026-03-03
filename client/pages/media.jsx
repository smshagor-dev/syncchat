import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import moment from 'moment';
import * as bi from 'react-icons/bi';
import { setPage } from '../redux/features/page';
import { setModal } from '../redux/features/modal';

function Media() {
  const dispatch = useDispatch();
  const page = useSelector((state) => state.page);

  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('photo');

  useEffect(() => {
    const abortCtrl = new AbortController();

    const getMedia = async () => {
      if (!page.media) {
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
  }, [page.media]);

  const tabs = [
    { target: 'photo', html: 'Photo' },
    { target: 'video', html: 'Video' },
    { target: 'link', html: 'Link' },
    { target: 'file', html: 'File' },
  ];

  const filtered = useMemo(
    () => items.filter((item) => item.kind === tab),
    [items, tab]
  );

  return (
    <div
      className={`
        ${page.media ? 'delay-75' : '-translate-x-full'}
        transition duration-200 absolute w-full h-full z-20 select-none grid grid-rows-[auto_auto_1fr] overflow-hidden
        bg-white dark:bg-spill-900 dark:text-white/90
      `}
      id="media-page"
    >
      <div className="h-16 px-2 flex gap-4 items-center border-b border-spill-200 dark:border-spill-800">
        <button
          type="button"
          className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
          onClick={() => {
            dispatch(setPage({ target: 'media', data: false }));
          }}
        >
          <bi.BiArrowBack className="text-2xl" />
        </button>
        <h1 className="text-2xl font-bold">Media</h1>
      </div>

      <div className="px-3 py-2 flex gap-2 border-b border-spill-200 dark:border-spill-800">
        {tabs.map((elem) => (
          <button
            key={elem.target}
            type="button"
            className={`${
              tab === elem.target
                ? 'bg-sky-600 text-white'
                : 'bg-spill-100 text-spill-700 dark:bg-spill-800 dark:text-spill-200'
            } px-3 py-1.5 rounded-full text-sm font-semibold`}
            onClick={() => setTab(elem.target)}
          >
            {elem.html}
          </button>
        ))}
      </div>

      <div className="p-3 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
        {!loaded && (
          <div className="h-full flex justify-center items-center">
            <i className="animate-spin">
              <bi.BiLoaderAlt size={22} />
            </i>
          </div>
        )}

        {loaded && filtered.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center opacity-70">
            <bi.BiImageAlt size={46} />
            <p className="mt-2">No {tab} found yet.</p>
          </div>
        )}

        {loaded && ['photo', 'video'].includes(tab) && filtered.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((item) => (
              <div
                key={item._id}
                className="rounded-md overflow-hidden border border-spill-200 dark:border-spill-700 bg-spill-50 dark:bg-spill-900/40"
              >
                {tab === 'photo' ? (
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

        {loaded && tab === 'link' && filtered.length > 0 && (
          <div className="grid gap-2">
            {filtered.map((item) => (
              <a
                key={item._id}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="p-3 rounded-md border border-spill-200 dark:border-spill-700 bg-spill-50 dark:bg-spill-900/40 hover:bg-spill-100 dark:hover:bg-spill-800"
              >
                <p className="text-sm text-sky-700 dark:text-sky-400 break-all">
                  {item.url}
                </p>
                <p className="text-xs mt-1 opacity-70">
                  {moment(item.createdAt).fromNow()}
                </p>
              </a>
            ))}
          </div>
        )}

        {loaded && tab === 'file' && filtered.length > 0 && (
          <div className="grid gap-2">
            {filtered.map((item) => (
              <div
                key={item._id}
                className="p-3 rounded-md border border-spill-200 dark:border-spill-700 bg-spill-50 dark:bg-spill-900/40 grid grid-cols-[auto_1fr_auto] gap-3 items-center"
              >
                <bi.BiFile className="text-xl" />
                <span className="overflow-hidden">
                  <p className="truncate">{item.file.originalname}</p>
                  <p className="text-xs opacity-70">
                    {moment(item.createdAt).fromNow()}
                  </p>
                </span>
                <a
                  href={item.file.url}
                  download={item.file.originalname}
                  className="p-2 rounded-full hover:bg-spill-200 dark:hover:bg-spill-700"
                >
                  <bi.BiDownload />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Media;
