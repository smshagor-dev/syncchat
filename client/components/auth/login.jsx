import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import config from '../../config';

function Login({ setRespond, onForgotPass }) {
  const cache = JSON.parse(localStorage.getItem('cache'));

  const [process, setProcess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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

      // store jwt token on localStorage
      localStorage.setItem('token', data.payload);
      localStorage.setItem(
        'cache',
        JSON.stringify({
          me: form.me ? form.username : null,
        })
      );

      // reset form
      setForm((prev) => ({ ...prev, username: '', password: '' }));
      setRespond({ success: true, message: data.message });

      // reload this page after 1s
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
    </form>
  );
}

export default Login;
