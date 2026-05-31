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

      setRespond({
        success: true,
        message: data.message,
      });
      setStep(2);
      setProcess(false);
    } catch (error0) {
      setProcess(false);
      setRespond({
        success: false,
        message: error0.response?.data?.message || 'Failed to request code',
      });
    }
  };

  const handleVerifyCode = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);

      const { data } = await axios.post('/users/forgot-pass/verify', {
        email: form.email,
        otp: Number(form.otp),
      });

      setRespond({
        success: true,
        message: data.message,
      });
      setStep(3);
      setProcess(false);
    } catch (error0) {
      setProcess(false);
      setRespond({
        success: false,
        message: error0.response?.data?.message || 'Invalid verification code',
      });
    }
  };

  const handleResetPassword = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);

      const { data } = await axios.post('/users/forgot-pass/reset', {
        email: form.email,
        newPass: form.newPass,
        confirmNewPass: form.confirmNewPass,
      });

      setRespond({
        success: true,
        message: data.message,
      });

      setForm({
        email: '',
        otp: '',
        newPass: '',
        confirmNewPass: '',
      });

      setStep(1);
      setProcess(false);
      onBackToLogin();
    } catch (error0) {
      setProcess(false);
      setRespond({
        success: false,
        message: error0.response?.data?.message || 'Failed to reset password',
      });
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
    <form
      method="post"
      className="grid gap-4 font-auth"
      onSubmit={handleSubmit}
    >
      <Helmet>
        <title>{`Forgot Password - ${config.brandName}`}</title>
      </Helmet>
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
        <span
          className={`${
            step >= 1 ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500'
          } flex h-5 w-5 items-center justify-center rounded-full text-[11px]`}
        >
          1
        </span>
        <span
          className={`${
            step >= 2 ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500'
          } flex h-5 w-5 items-center justify-center rounded-full text-[11px]`}
        >
          2
        </span>
        <span
          className={`${
            step >= 3 ? 'bg-sky-600 text-white' : 'bg-slate-200 text-slate-500'
          } flex h-5 w-5 items-center justify-center rounded-full text-[11px]`}
        >
          3
        </span>
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
          <bi.BiCheck className="absolute right-3 text-lg text-emerald-600 hidden peer-valid:block" />
          <bi.BiX className="absolute right-3 text-lg text-rose-600 hidden peer-invalid:block" />
        </label>
      )}

      {step === 2 && (
        <label htmlFor="otp" className="relative flex items-center">
          <i className="absolute left-4 text-slate-500">
            <bi.BiShield size={20} />
          </i>
          <input
            type="text"
            name="otp"
            id="otp"
            autoComplete="one-time-code"
            placeholder="4-digit code"
            maxLength={4}
            minLength={4}
            pattern="[0-9]{4}"
            className={`${
              form.otp.length > 0 ? 'peer valid:border-emerald-400' : 'peer'
            } w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100`}
            value={form.otp}
            onChange={handleChange}
            required
          />
          <bi.BiCheck className="absolute right-3 text-lg text-emerald-600 hidden peer-valid:block" />
          <bi.BiX className="absolute right-3 text-lg text-rose-600 hidden peer-invalid:block" />
        </label>
      )}

      {step === 3 && (
        <div className="grid gap-2">
          {[
            {
              target: 'newPass',
              placeholder: 'New password',
            },
            {
              target: 'confirmNewPass',
              placeholder: 'Confirm new password',
            },
          ].map((elem) => (
            <label
              key={elem.target}
              htmlFor={elem.target}
              className="relative flex items-center"
            >
              <i className="absolute left-4 text-slate-500">
                <bi.BiLockOpenAlt size={20} />
              </i>
              <input
                type="password"
                name={elem.target}
                id={elem.target}
                autoComplete="new-password"
                placeholder={elem.placeholder}
                minLength={6}
                className={`${
                  form[elem.target].length > 0
                    ? 'peer valid:border-emerald-400'
                    : 'peer'
                } w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100`}
                value={form[elem.target]}
                onChange={handleChange}
                required
              />
              <bi.BiCheck className="absolute right-3 text-lg text-emerald-600 hidden peer-valid:block" />
              <bi.BiX className="absolute right-3 text-lg text-rose-600 hidden peer-invalid:block" />
            </label>
          ))}
        </div>
      )}

      <button
        type="submit"
        className="mt-2 flex justify-center rounded-xl bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:brightness-110"
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
