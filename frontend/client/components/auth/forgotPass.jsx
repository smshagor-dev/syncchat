import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import config from '../../config';

function ForgotPass({ setRespond, onBackToLogin }) {
  const [process, setProcess] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    email: '',
    otp: '',
    resetToken: '',
    newPass: '',
    confirmNewPass: '',
  });

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleRequestCode = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);
      const { data } = await axios.post('/users/forgot-pass/request', {
        email: form.email,
      });
      setRespond({ success: true, message: data.message });
      setForm((prev) => ({ ...prev, otp: '', resetToken: '' }));
      setStep(2);
    } catch (error0) {
      setRespond({
        success: false,
        message: error0.response?.data?.message || 'Failed to request code',
      });
    } finally {
      setProcess(false);
    }
  };

  const handleVerifyCode = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);
      const { data } = await axios.post('/users/forgot-pass/verify', {
        email: form.email,
        otp: form.otp,
      });
      const resetToken = String(data?.payload?.resetToken || '');
      if (!resetToken) throw new Error('Secure reset session was not created');
      setForm((prev) => ({ ...prev, resetToken }));
      setRespond({ success: true, message: data.message });
      setStep(3);
    } catch (error0) {
      setRespond({
        success: false,
        message:
          error0.response?.data?.message ||
          error0.message ||
          'Invalid verification code',
      });
    } finally {
      setProcess(false);
    }
  };

  const handleResetPassword = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);
      const { data } = await axios.post('/users/forgot-pass/reset', {
        email: form.email,
        resetToken: form.resetToken,
        newPass: form.newPass,
        confirmNewPass: form.confirmNewPass,
      });
      setRespond({ success: true, message: data.message });
      setForm({
        email: '',
        otp: '',
        resetToken: '',
        newPass: '',
        confirmNewPass: '',
      });
      setStep(1);
      onBackToLogin();
    } catch (error0) {
      setRespond({
        success: false,
        message: error0.response?.data?.message || 'Failed to reset password',
      });
    } finally {
      setProcess(false);
    }
  };

  const buttonLabel = () => {
    if (step === 1) return 'Send code';
    if (step === 2) return 'Verify code';
    return 'Reset password';
  };

  const handleSubmit = (e) => {
    if (step === 1) return handleRequestCode(e);
    if (step === 2) return handleVerifyCode(e);
    return handleResetPassword(e);
  };

  return (
    <form method="post" className="grid gap-4 font-auth" onSubmit={handleSubmit}>
      <Helmet>
        <title>{`Forgot Password - ${config.brandName}`}</title>
      </Helmet>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
        {[1, 2, 3].map((item) => (
          <span
            key={item}
            className={`${
              step >= item ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500'
            } flex h-5 w-5 items-center justify-center rounded-full text-[11px]`}
          >
            {item}
          </span>
        ))}
        <p>Secure password recovery</p>
      </div>

      {step === 1 && (
        <label htmlFor="email" className="relative flex items-center">
          <i className="absolute left-4 text-slate-500">
            <bi.BiEnvelope size={20} />
          </i>
          <input
            type="email"
            name="email"
            id="email"
            autoComplete="email"
            placeholder="Email address"
            className={`${
              form.email.length > 0 ? 'peer valid:border-emerald-400' : 'peer'
            } w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100`}
            value={form.email}
            onChange={handleChange}
            required
          />
          <bi.BiCheck className="absolute right-3 hidden text-lg text-emerald-600 peer-valid:block" />
          <bi.BiX className="absolute right-3 hidden text-lg text-rose-600 peer-invalid:block" />
        </label>
      )}

      {step === 2 && (
        <label htmlFor="otp" className="relative flex items-center">
          <i className="absolute left-4 text-slate-500">
            <bi.BiShield size={20} />
          </i>
          <input
            type="text"
            inputMode="numeric"
            name="otp"
            id="otp"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            minLength={6}
            pattern="[0-9]{6}"
            className={`${
              form.otp.length > 0 ? 'peer valid:border-emerald-400' : 'peer'
            } w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100`}
            value={form.otp}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                otp: e.target.value.replace(/\D+/g, '').slice(0, 6),
              }))
            }
            required
          />
          <bi.BiCheck className="absolute right-3 hidden text-lg text-emerald-600 peer-valid:block" />
          <bi.BiX className="absolute right-3 hidden text-lg text-rose-600 peer-invalid:block" />
        </label>
      )}

      {step === 3 && (
        <div className="grid gap-2">
          {[
            { target: 'newPass', placeholder: 'New password' },
            { target: 'confirmNewPass', placeholder: 'Confirm new password' },
          ].map((elem) => (
            <label key={elem.target} htmlFor={elem.target} className="relative flex items-center">
              <i className="absolute left-4 text-slate-500">
                <bi.BiLockOpenAlt size={20} />
              </i>
              <input
                type="password"
                name={elem.target}
                id={elem.target}
                autoComplete="new-password"
                placeholder={elem.placeholder}
                minLength={8}
                maxLength={128}
                pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,128}"
                title="Use at least 8 characters with at least one letter and one number"
                className={`${
                  form[elem.target].length > 0
                    ? 'peer valid:border-emerald-400'
                    : 'peer'
                } w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100`}
                value={form[elem.target]}
                onChange={handleChange}
                required
              />
              <bi.BiCheck className="absolute right-3 hidden text-lg text-emerald-600 peer-valid:block" />
              <bi.BiX className="absolute right-3 hidden text-lg text-rose-600 peer-invalid:block" />
            </label>
          ))}
          <p className="text-xs text-slate-500">
            Use at least 8 characters with at least one letter and one number.
          </p>
        </div>
      )}

      <button
        type="submit"
        className="mt-2 flex justify-center rounded-xl bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:brightness-110 disabled:opacity-60"
        disabled={process}
      >
        {process ? (
          <i className="animate-spin">
            <bi.BiLoaderAlt />
          </i>
        ) : (
          <p>{buttonLabel()}</p>
        )}
      </button>

      <button
        type="button"
        className="rounded-xl border border-slate-300 bg-white py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
        onClick={onBackToLogin}
      >
        Back to sign in
      </button>
    </form>
  );
}

export default ForgotPass;
