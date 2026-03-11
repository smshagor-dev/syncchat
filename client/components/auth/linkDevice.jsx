import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import config from '../../config';

function LinkDevice({ setRespond, initialToken = '', onBack = () => {} }) {
  const [process, setProcess] = useState(false);
  const [lookup, setLookup] = useState({
    token: initialToken || '',
    shortCode: '',
    info: null,
  });
  const [codes, setCodes] = useState({
    emailCode: '',
    supportCode: '',
  });

  const fetchInfo = async ({ token = '', shortCode = '' }) => {
    const { data } = await axios.post('/users/device-link/info', {
      token,
      shortCode,
    });
    return data?.payload || null;
  };

  useEffect(() => {
    let mounted = true;
    if (!initialToken) return undefined;

    const run = async () => {
      try {
        setProcess(true);
        const info = await fetchInfo({ token: initialToken });
        if (!mounted) return;
        setLookup((prev) => ({
          ...prev,
          token: info?.token || initialToken,
          shortCode: info?.shortCode || '',
          info,
        }));
        setRespond({
          success: true,
          message: 'QR link detected. Enter the two verification codes to continue.',
        });
      } catch (error0) {
        if (!mounted) return;
        setRespond({
          success: false,
          message: error0?.response?.data?.message || error0.message,
        });
      } finally {
        if (mounted) setProcess(false);
      }
    };

    run();
    return () => {
      mounted = false;
    };
  }, [initialToken, setRespond]);

  const handleLookup = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);
      const info = await fetchInfo({
        token: lookup.token,
        shortCode: lookup.shortCode,
      });
      setLookup((prev) => ({
        ...prev,
        token: info?.token || prev.token,
        shortCode: info?.shortCode || prev.shortCode,
        info,
      }));
      setRespond({
        success: true,
        message: 'Device link found. Enter the email code and the SyncChat Support chat code.',
      });
    } catch (error0) {
      setRespond({
        success: false,
        message: error0?.response?.data?.message || 'Unable to find that device link request.',
      });
    } finally {
      setProcess(false);
    }
  };

  const handleComplete = async (e) => {
    try {
      e.preventDefault();
      if (!lookup.token) {
        throw new Error('Device link token is missing');
      }

      setProcess(true);
      const { data } = await axios.post('/users/device-link/complete', {
        token: lookup.token,
        emailCode: codes.emailCode,
        supportCode: codes.supportCode,
      });
      localStorage.setItem('token', data?.payload?.token || '');
      setRespond({ success: true, message: data?.message || 'Device linked' });
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (error0) {
      setProcess(false);
      setRespond({
        success: false,
        message: error0?.response?.data?.message || error0.message,
      });
    }
  };

  return (
    <div className="grid gap-4 font-auth">
      <Helmet>
        <title>{`Link device - ${config.brandName}`}</title>
      </Helmet>

      <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        Scan the QR from your logged-in SyncChat device or enter the 6-digit short code manually.
      </div>

      {!lookup.info ? (
        <form className="grid gap-4" onSubmit={handleLookup}>
          <label className="relative flex items-center">
            <i className="absolute left-4 text-slate-500">
              <bi.BiQrScan size={20} />
            </i>
            <input
              type="text"
              placeholder="Paste QR token"
              className="w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
              value={lookup.token}
              onChange={(e) =>
                setLookup((prev) => ({ ...prev, token: e.target.value.trim() }))
              }
            />
          </label>
          <label className="relative flex items-center">
            <i className="absolute left-4 text-slate-500">
              <bi.BiHash size={20} />
            </i>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Or enter 6-digit short code"
              maxLength={6}
              className="w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
              value={lookup.shortCode}
              onChange={(e) =>
                setLookup((prev) => ({
                  ...prev,
                  shortCode: e.target.value.replace(/\D+/g, '').slice(0, 6),
                }))
              }
            />
          </label>
          <button
            type="submit"
            className="flex justify-center rounded-xl bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:brightness-110 disabled:opacity-60"
            disabled={process}
          >
            {process ? <bi.BiLoaderAlt className="animate-spin" /> : 'Continue'}
          </button>
        </form>
      ) : (
        <form className="grid gap-4" onSubmit={handleComplete}>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-semibold">{lookup.info.accountName}</p>
            <p className="mt-1">Email code sent to {lookup.info.emailHint}</p>
            <p className="mt-1">Support code sent to the SyncChat Support chat on your signed-in device.</p>
            <p className="mt-1">Short code: {lookup.info.shortCode}</p>
          </div>
          <label className="relative flex items-center">
            <i className="absolute left-4 text-slate-500">
              <bi.BiEnvelope size={20} />
            </i>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Email verification code"
              maxLength={6}
              required
              className="w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
              value={codes.emailCode}
              onChange={(e) =>
                setCodes((prev) => ({
                  ...prev,
                  emailCode: e.target.value.replace(/\D+/g, '').slice(0, 6),
                }))
              }
            />
          </label>
          <label className="relative flex items-center">
            <i className="absolute left-4 text-slate-500">
              <bi.BiMessageDetail size={20} />
            </i>
            <input
              type="text"
              inputMode="numeric"
              placeholder="SyncChat Support chat code"
              maxLength={6}
              required
              className="w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
              value={codes.supportCode}
              onChange={(e) =>
                setCodes((prev) => ({
                  ...prev,
                  supportCode: e.target.value.replace(/\D+/g, '').slice(0, 6),
                }))
              }
            />
          </label>
          <button
            type="submit"
            className="flex justify-center rounded-xl bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:brightness-110 disabled:opacity-60"
            disabled={process}
          >
            {process ? <bi.BiLoaderAlt className="animate-spin" /> : 'Verify and link device'}
          </button>
        </form>
      )}

      <button
        type="button"
        className="text-sm font-semibold text-sky-700 hover:text-sky-900 hover:underline"
        onClick={onBack}
      >
        Back
      </button>
    </div>
  );
}

export default LinkDevice;
