import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import config from '../../config';
import SocialAuth from './socialAuth';

function Login({ setRespond, onForgotPass, onLoginWithQr }) {
  const cache = JSON.parse(localStorage.getItem('cache'));

  const [process, setProcess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactor, setTwoFactor] = useState({
    required: false,
    code: '',
    tempToken: '',
    method: 'totp',
  });
  const [form, setForm] = useState({
    me: false,
    username: cache?.me || '',
    password: '',
  });

  const handleChange = (e) => {
    // if it's a checkbox, get target.checked
    setForm((prev) => ({
      ...prev,
      [e.target.name]:
        e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);
      const { data } = await axios.post('/users/login', form);

      if (data?.payload?.requiresTwoFactor) {
        setTwoFactor({
          required: true,
          code: '',
          tempToken: data.payload.tempToken,
          method: 'totp',
        });
        setProcess(false);
        setRespond({
          success: true,
          message: 'Enter your Google Authenticator code to continue.',
        });
        return;
      }

      const loginToken = data?.payload?.token || data?.payload;
      localStorage.setItem('token', loginToken);
      localStorage.setItem(
        'cache',
        JSON.stringify({
          me: form.me ? form.username : null,
        })
      );

      setForm((prev) => ({ ...prev, username: '', password: '' }));
      setRespond({ success: true, message: data.message });

      setTimeout(() => {
        setProcess(false);
        window.location.reload();
      }, 1000);
    } catch (error0) {
      setProcess(false);
      setRespond({
        success: false,
        message:
          error0?.response?.data?.message ||
          'Unable to connect to server. Please try again.',
      });
    }
  };

  const submitTwoFactor = async (e) => {
    try {
      e.preventDefault();
      setProcess(true);
      const payload = {
        tempToken: twoFactor.tempToken,
      };
      if (twoFactor.method === 'recovery') {
        payload.recoveryCode = twoFactor.code;
      } else {
        payload.code = twoFactor.code;
      }

      const { data } = await axios.post('/users/login/2fa-verify', payload);

      localStorage.setItem('token', data.payload.token);
      localStorage.setItem(
        'cache',
        JSON.stringify({
          me: form.me ? form.username : null,
        })
      );
      setRespond({ success: true, message: data.message });

      setTimeout(() => {
        setProcess(false);
        window.location.reload();
      }, 1000);
    } catch (error0) {
      setProcess(false);
      setRespond({
        success: false,
        message:
          error0?.response?.data?.message ||
          'Invalid verification code. Please try again.',
      });
    }
  };

  if (twoFactor.required) {
    const formatRecoveryCode = (value) => {
      const raw = String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);
      if (raw.length <= 4) return raw;
      return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    };

    return (
      <form method="post" className="grid gap-4 font-auth" onSubmit={submitTwoFactor}>
        <Helmet>
          <title>{`Two-Factor Verification - ${config.brandName}`}</title>
        </Helmet>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {twoFactor.method === 'recovery'
            ? 'Enter one of your recovery codes to continue.'
            : 'Google Authenticator code is required after password verification.'}
        </div>
        <label htmlFor="login-2fa-code" className="relative flex items-center">
          <i className="absolute left-4 text-slate-500">
            <bi.BiShieldQuarter size={20} />
          </i>
          <input
            type="text"
            inputMode={twoFactor.method === 'recovery' ? 'text' : 'numeric'}
            id="login-2fa-code"
            autoComplete="one-time-code"
            placeholder={
              twoFactor.method === 'recovery'
                ? 'Recovery code (ABCD-EFGH)'
                : '6-digit code'
            }
            minLength={twoFactor.method === 'recovery' ? 9 : 6}
            maxLength={twoFactor.method === 'recovery' ? 9 : 6}
            className="w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100"
            value={twoFactor.code}
            onChange={(e) =>
              setTwoFactor((prev) => ({
                ...prev,
                code:
                  prev.method === 'recovery'
                    ? formatRecoveryCode(e.target.value)
                    : e.target.value.replace(/\D+/g, '').slice(0, 6),
              }))
            }
            required
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            className="font-semibold text-slate-600 hover:text-slate-900"
            onClick={() =>
              setTwoFactor((prev) => ({
                ...prev,
                method: prev.method === 'recovery' ? 'totp' : 'recovery',
                code: '',
              }))
            }
          >
            {twoFactor.method === 'recovery'
              ? 'Use authenticator code'
              : 'Use recovery code'}
          </button>
          <button
            type="button"
            className="font-semibold text-slate-600 hover:text-slate-900"
            onClick={() => {
              setTwoFactor({
                required: false,
                code: '',
                tempToken: '',
                method: 'totp',
              });
              setRespond({ success: true, message: null });
            }}
          >
            Back
          </button>
        </div>
        <div className="flex items-center justify-between gap-3">
          <button
            type="submit"
            className="flex justify-center rounded-xl bg-gradient-to-r from-sky-600 via-cyan-600 to-teal-500 px-5 py-3 font-semibold text-white shadow-lg shadow-sky-200 transition hover:brightness-110"
            disabled={process}
          >
            {process ? (
              <i className="animate-spin">
                <bi.BiLoaderAlt />
              </i>
            ) : (
              <p>Verify and continue</p>
            )}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      method="post"
      className="grid gap-4 font-auth"
      onSubmit={handleSubmit}
    >
      <Helmet>
        <title>{`Sign in - ${config.brandName}`}</title>
      </Helmet>
      {[
        {
          target: 'username',
          type: 'text',
          placeholder: 'Username or Email',
          icon: <bi.BiUser size={20} />,
          minLength: 3,
        },
        {
          target: 'password',
          type: showPassword ? 'text' : 'password',
          placeholder: 'Password',
          icon: <bi.BiLockOpenAlt size={20} />,
          minLength: 6,
        },
      ].map((elem) => (
        <label
          key={elem.target}
          htmlFor={elem.target}
          className="relative flex items-center"
        >
          <i className="absolute left-4 text-slate-500">{elem.icon}</i>
          <input
            type={elem.type}
            name={elem.target}
            id={elem.target}
            autoComplete={
              elem.target === 'username' ? 'username' : 'current-password'
            }
            placeholder={elem.placeholder}
            minLength={elem.minLength}
            className={`${
              form[elem.target].length > 0
                ? 'peer valid:border-emerald-400'
                : 'peer'
            } w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100`}
            value={form[elem.target]}
            onChange={handleChange}
            required
          />
          {elem.target === 'password' ? (
            <button
              type="button"
              className="absolute right-3 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <bi.BiHide /> : <bi.BiShow />}
            </button>
          ) : (
            <>
              <bi.BiCheck className="absolute right-3 text-lg text-emerald-600 hidden peer-valid:block" />
              <bi.BiX className="absolute right-3 text-lg text-rose-600 hidden peer-invalid:block" />
            </>
          )}
        </label>
      ))}
      <span className="flex items-center justify-between gap-3">
        <label
          htmlFor="me"
          className="flex items-center gap-2 cursor-pointer text-sm text-slate-600"
        >
          <input
            type="checkbox"
            name="me"
            id="me"
            autoComplete="off"
            onChange={handleChange}
            defaultChecked={!!cache?.me}
            className="h-4 w-4 accent-sky-600"
          />
          <p>Remember me</p>
        </label>
        <button
          type="button"
          className="text-sm font-semibold text-sky-700 hover:text-sky-900 hover:underline"
          onClick={onForgotPass}
        >
          Forgot password?
        </button>
      </span>
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
          <p>Sign in to your account</p>
        )}
      </button>
      <button
        type="button"
        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        onClick={() => onLoginWithQr?.()}
      >
        <bi.BiQrScan size={18} />
        Login via QR code
      </button>

      <SocialAuth
        setRespond={setRespond}
        rememberValue={form.username}
        onTwoFactorRequired={({ tempToken, message }) => {
          setTwoFactor({
            required: true,
            code: '',
            tempToken,
            method: 'totp',
          });
          setRespond({ success: true, message });
        }}
      />
    </form>
  );
}

export default Login;
