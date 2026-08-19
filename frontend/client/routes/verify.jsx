import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import { setMaster } from '../redux/features/user';
import config from '../config';

const emptyOtp = () => ({ 0: '', 1: '', 2: '', 3: '', 4: '', 5: '' });

function Verify() {
  const dispatch = useDispatch();
  const master = useSelector((state) => state.user.master);
  const [process, setProcess] = useState(false);
  const [resending, setResending] = useState(false);
  const [respond, setRespond] = useState({ success: true, message: null });
  const [otp, setOtp] = useState(emptyOtp);

  const handleSubmit = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);
      const code = Object.values(otp).join('');
      if (!/^\d{6}$/.test(code)) throw new Error('Enter the complete 6-digit code');

      const { data } = await axios.post('/users/verify', { otp: code });
      setOtp(emptyOtp());
      setRespond({
        success: true,
        message: data.message || 'Account verified successfully',
      });
      dispatch(setMaster(data.payload));
      setTimeout(() => window.location.reload(), 400);
    } catch (error0) {
      setRespond({
        success: false,
        message:
          error0?.response?.data?.message || error0.message || 'Invalid verification code',
      });
      setProcess(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      setResending(true);
      const { data } = await axios.post('/users/verify/resend');
      setOtp(emptyOtp());
      setRespond({
        success: true,
        message: data.message || 'Verification code sent successfully',
      });
    } catch (error0) {
      setRespond({
        success: false,
        message: error0?.response?.data?.message || 'Failed to resend verification code',
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
              Email verification
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Enter the 6-digit code sent to{' '}
              <span className="font-semibold text-slate-700">{master.email}</span>.
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
            <div className="mt-4 flex justify-center gap-2 sm:gap-3">
              {Object.keys(otp).map((elem, i) => (
                <input
                  type="text"
                  inputMode="numeric"
                  key={elem}
                  name={elem}
                  id={`otp-${elem}`}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  aria-label={`Verification digit ${i + 1}`}
                  className={`${
                    respond.success
                      ? 'border-slate-400 focus:border-sky-500'
                      : 'border-rose-500 focus:border-rose-600'
                  } h-12 w-11 rounded-xl border-2 bg-slate-50 text-center text-xl font-bold text-slate-900 shadow-sm transition focus:bg-white sm:h-14 sm:w-14 sm:text-2xl`}
                  maxLength={1}
                  required
                  value={otp[elem]}
                  onPaste={(e) => {
                    const digits = e.clipboardData.getData('text').replace(/\D+/g, '').slice(0, 6);
                    if (digits.length !== 6) return;
                    e.preventDefault();
                    const nextOtp = emptyOtp();
                    digits.split('').forEach((digit, index) => {
                      nextOtp[index] = digit;
                    });
                    setOtp(nextOtp);
                    document.querySelector('#otp-5')?.focus();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' || e.key === 'Delete') {
                      if (!otp[elem] && e.currentTarget.previousElementSibling) {
                        e.currentTarget.previousElementSibling.focus();
                      }
                      setOtp((prev) => ({ ...prev, [elem]: '' }));
                      return;
                    }
                    if (
                      !/^\d$/.test(e.key) &&
                      !['Tab', 'ArrowLeft', 'ArrowRight'].includes(e.key)
                    ) {
                      e.preventDefault();
                    }
                  }}
                  onChange={(e) => {
                    const digit = e.target.value.replace(/\D+/g, '').slice(-1);
                    setRespond((prev) => ({ ...prev, success: true }));
                    setOtp((prev) => ({ ...prev, [elem]: digit }));
                    if (digit && e.currentTarget.nextElementSibling) {
                      e.currentTarget.nextElementSibling.focus();
                    }
                  }}
                />
              ))}
            </div>

            <button
              type="submit"
              className="mb-2 mt-6 flex justify-center rounded-xl bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:brightness-110 disabled:opacity-60"
              disabled={process}
            >
              {process ? (
                <i className="animate-spin">
                  <bi.BiLoaderAlt />
                </i>
              ) : (
                'Verify code'
              )}
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-300 bg-white py-3 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
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
