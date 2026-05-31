import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import * as bi from 'react-icons/bi';
import { setPage } from '../redux/features/page';

const PRIVACY_POINTS = [
  'We use your account information to provide chat, call, and security features.',
  'Messages and calls are protected with end-to-end encryption in supported chats.',
  'We store limited metadata (time, delivery status, device/session info) to operate the service.',
  'You can manage profile visibility, blocked users, notification, and privacy settings from the app.',
  'Reported content may be reviewed for safety, abuse prevention, and legal compliance.',
  'You can request account deletion and your personal data is removed according to retention policy.',
];

const TERMS_POINTS = [
  'You must use the app lawfully and must not abuse, harass, scam, or impersonate others.',
  'You are responsible for content you send, upload, or share in chats, groups, and status.',
  'Do not attempt unauthorized access, reverse engineering, or disruption of services.',
  'Accounts violating policy can be limited, suspended, or removed without prior notice.',
  'Features can change over time and service availability is not guaranteed in all regions/devices.',
  'Continued use of the app means you agree to the latest Terms and Privacy Policy.',
];

function Policy() {
  const dispatch = useDispatch();
  const page = useSelector((state) => state.page);
  const policyContext =
    typeof page.policy === 'object' && page.policy !== null ? page.policy : null;

  const [tab, setTab] = useState(policyContext?.tab || 'privacy');

  useEffect(() => {
    setTab(policyContext?.tab || 'privacy');
  }, [policyContext?.tab, page.policy]);

  const headerTitle = useMemo(
    () => (tab === 'terms' ? 'Terms & Conditions' : 'Privacy Policy'),
    [tab]
  );

  return (
    <div
      className={`${
        page.policy ? 'delay-75' : '-translate-x-full'
      } transition duration-200 absolute w-full h-full z-30 grid grid-rows-[auto_auto_1fr] overflow-hidden bg-white dark:bg-spill-900 dark:text-white/90`}
      id="policy-page"
    >
      <div className="h-16 px-2 flex gap-4 items-center border-b border-spill-200 dark:border-spill-800">
        <button
          type="button"
          className="p-2 rounded-full hover:bg-spill-100 dark:hover:bg-spill-800"
          onClick={() => dispatch(setPage({ target: 'policy', data: false }))}
        >
          <bi.BiArrowBack className="text-2xl" />
        </button>
        <h1 className="text-2xl font-bold">{headerTitle}</h1>
      </div>

      <div className="px-3 py-2 flex gap-2 border-b border-spill-200 dark:border-spill-800">
        {[
          { key: 'privacy', label: 'Privacy Policy' },
          { key: 'terms', label: 'Terms & Conditions' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className={`${
              tab === item.key
                ? 'bg-sky-600 text-white'
                : 'bg-spill-100 text-spill-700 dark:bg-spill-800 dark:text-spill-200'
            } px-3 py-1.5 rounded-full text-sm font-semibold`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-spill-200 hover:scrollbar-thumb-spill-300 dark:scrollbar-thumb-spill-700 dark:hover:scrollbar-thumb-spill-600">
        <div className="p-4 rounded-xl border border-spill-200 dark:border-spill-700 bg-spill-50 dark:bg-spill-800/40">
          <p className="text-sm opacity-80">
            Last updated: March 5, 2026. Please review this information
            carefully before continuing to use SyncChat.
          </p>
        </div>

        <div className="mt-4 grid gap-2">
          {(tab === 'terms' ? TERMS_POINTS : PRIVACY_POINTS).map((point) => (
            <div
              key={point}
              className="p-3 rounded-lg border border-spill-200 dark:border-spill-700 bg-white dark:bg-spill-900/40 grid grid-cols-[auto_1fr] gap-3 items-start"
            >
              <bi.BiCheckShield className="mt-0.5 text-sky-600 dark:text-sky-400" />
              <p className="text-sm leading-6">{point}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Policy;

