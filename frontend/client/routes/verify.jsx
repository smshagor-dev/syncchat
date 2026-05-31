import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setMaster } from '../redux/features/user';
import config from '../config';

function Verify() {
  const dispatch = useDispatch();
  const master = useSelector((state) => state.user.master);

  const [process, setProcess] = useState(false);
  const [resending, setResending] = useState(false);
  const [respond, setRespond] = useState({
    success: true,
    message: null,
  });
  const [otp, setOtp] = useState({
    0: '',
    1: '',
    2: '',
    3: '',
  });

  const handleSubmit = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);

      const { data } = await axios.post('/users/verify', {
        userId: master._id,
        otp: Number(Object.values(otp).join('')),
      });

      setOtp({
        0: '',
        1: '',
        2: '',
        3: '',
      });

      setRespond({
        success: true,
        message: data.message || 'OTP verified successfully',
      });
      dispatch(setMaster(data.payload));

      setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch (error0) {
      setProcess(false);
      setRespond({
        success: false,
        message: error0?.response?.data?.message || 'Invalid OTP code',
      });
    }
  };

  const handleResendOtp = async () => {
    try {
      setResending(true);
      const { data } = await axios.post('/users/verify/resend');
      setRespond({
        success: true,
        message: data.message || 'OTP resent successfully',
      });
    } catch (error0) {
      setRespond({
        success: false,
        message: error0?.response?.data?.message || 'Failed to resend OTP',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="absolute inset-0 overflow-auto bg-slate-950 font-auth text-slate-100">
      <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-cyan-500/30 blur-3xl" />
      <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-teal-500/20 blur-3xl" />

      <div className="relative flex min-h-full w-full items-center justify-center px-4 py-8 md:px-8">
        <section className="w-full max-w-xl rounded-3xl border border-slate-200/80 bg-white/95 p-5 text-slate-800 shadow-2xl shadow-slate-900/20 backdrop-blur-md sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Welcome to
              </p>
              <h1 className="font-authDisplay text-3xl font-bold text-slate-900">
                {config.brandName}
              </h1>
            </div>
            <span className="rounded-full bg-gradient-to-r from-sky-100 to-cyan-100 px-4 py-1 text-xs font-semibold text-slate-700">
              Verify account
            </span>
          </div>

          <div className="mb-4">
            <h2 className="font-authDisplay text-2xl font-semibold text-slate-900">
              OTP Verification
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter the 4-digit code sent to{' '}
              <span className="font-semibold text-slate-700">
                {master.email}
              </span>
              .
            </p>
          </div>

          {respond.message && (
            <p
              className={`${
                respond.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-rose-200 bg-rose-50 text-rose-700'
              } mb-4 rounded-xl border px-3 py-2 text-sm`}
            >
              {respond.message}
            </p>
          )}

          <form method="post" className="grid" onSubmit={handleSubmit}>
            <div className="mt-4 flex gap-3 justify-center">
              {[...Object.keys(otp)].map((elem, i) => (
                <input
                  type="text"
                  key={elem}
                  name={elem}
                  id={`otp-${elem}`}
                  autoComplete="one-time-code"
                  className={`${
                    respond.success
                      ? 'border-slate-400 focus:border-sky-500'
                      : 'border-rose-500 focus:border-rose-600'
                  } w-14 h-14 rounded-xl border-2 bg-slate-50 font-bold text-2xl text-center text-slate-900 shadow-sm transition focus:bg-white`}
                  maxLength="1"
                  required
                  value={otp[i]}
                  onKeyDown={(e) => {
                    const del = e.key === 'Backspace' || e.key === 'Delete';
                    const previous = e.target.previousSibling;

                    // numbers only
                    if (!'0123456789'.includes(e.key)) {
                      if (
                        ['Tab', 'Shift', 'ArrowLeft', 'ArrowRight'].includes(
                          e.key
                        )
                      ) {
                        return;
                      }
                      // ignore the next event
                      e.preventDefault();
                    }

                    // if the backspace and delete keys are clicked
                    if (del) {
                      setOtp((prev) => ({ ...prev, [elem]: '' }));
                      if (previous) previous.focus();

                      // ignore the next event
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    setRespond({ success: true });
                    setOtp((prev) => ({ ...prev, [elem]: e.target.value }));

                    const next = e.target.nextSibling;
                    if (next) next.focus();
                  }}
                />
              ))}
            </div>
            <button
              type="submit"
              className="mt-6 mb-2 flex justify-center rounded-xl bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:brightness-110"
              disabled={process}
            >
              {process ? (
                <i className="animate-spin">
                  <bi.BiLoaderAlt />
                </i>
              ) : (
                <p>Verify code</p>
              )}
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={handleResendOtp}
              disabled={resending}
            >
              {resending ? 'Sending...' : 'Re-Send OTP'}
            </button>
          </form>

          <div className="pt-5">
            <button
              type="button"
              className="font-semibold text-sky-700 hover:text-sky-900 hover:underline"
              onClick={() => {
                localStorage.removeItem('token');
                window.location.reload();
              }}
            >
              Back to sign in
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Verify;
