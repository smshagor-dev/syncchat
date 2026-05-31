import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setPage } from '../redux/features/page';

const LICENSE_POINTS = [
  'SyncChat is distributed under the GPL-3.0 license.',
  'You may run, study, modify, and share the software under the GPL-3.0 terms.',
  'If you distribute modified versions, you must also provide source code under the same license.',
  'Third-party libraries used by SyncChat remain under their own respective licenses.',
  'License notices for bundled dependencies may appear in generated build artifacts.',
  'See the project root LICENSE file for the full legal text.',
];

function License() {
  const dispatch = useDispatch();
  const page = useSelector((state) => state.page);

  return (
    <div
      className={`${
        page.license ? 'delay-75' : '-translate-x-full'
      } transition duration-200 absolute w-full h-full z-30 grid grid-rows-[auto_1fr] overflow-hidden bg-white dark:bg-spill-900 dark:text-white/90`}
      id="license-page"
    >
      <div className="h-16 px-2 flex gap-4 items-center border-b border-spill-200 dark:border-spill-800">
        <button
          type="button"
          className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
          onClick={() => dispatch(setPage({ target: 'license', data: false }))}
        >
          <bi.BiArrowBack className="text-2xl" />
        </button>
        <h1 className="text-2xl font-bold">License</h1>
      </div>

      <div className="p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
        <div className="p-4 rounded-xl border border-spill-200 dark:border-spill-700 bg-spill-50 dark:bg-spill-800/40">
          <p className="text-sm opacity-80">
            SyncChat licensing summary. For the full license text, see the root
            project `LICENSE` file.
          </p>
        </div>

        <div className="mt-4 grid gap-2">
          {LICENSE_POINTS.map((point) => (
            <div
              key={point}
              className="p-3 rounded-lg border border-spill-200 dark:border-spill-700 bg-white dark:bg-spill-900/40 grid grid-cols-[auto_1fr] gap-3 items-start"
            >
              <bi.BiInfoCircle className="mt-0.5 text-sky-600 dark:text-sky-400" />
              <p className="text-sm leading-6">{point}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default License;
