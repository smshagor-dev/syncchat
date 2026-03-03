import React, { useState } from 'react';
import { Helmet } from 'react-helmet';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import config from '../../config';

function Register({ setRespond }) {
  const [process, setProcess] = useState(false);
  const [showPassword, setShowPassword] = useState({
    password: false,
    confirmPassword: false,
  });
  const [form, setForm] = useState({
    fullname: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleChange = (e) => {
    setForm((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    try {
      e.preventDefault();
      if (form.password !== form.confirmPassword) {
        setRespond({
          success: false,
          message: "Password and confirm password don't match",
        });
        return;
      }

      setProcess(true);

      const { data } = await axios.post('/users/register', {
        fullname: form.fullname,
        username: form.username,
        email: form.email,
        password: form.password,
      });

      // set success response
      setRespond({ success: true, message: data.message });
      // reset form
      setForm({
        fullname: '',
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
      });

      setTimeout(() => {
        // set localStorage
        localStorage.setItem('token', data.payload);
        localStorage.setItem(
          'cache',
          JSON.stringify({ remember: form.username })
        );

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
        <title>{`Sign up - ${config.brandName}`}</title>
      </Helmet>
      {[
        {
          target: 'fullname',
          type: 'text',
          placeholder: 'Full Name',
          icon: <bi.BiUser size={20} />,
          pattern: '.{3,32}',
          autocomplete: 'name',
        },
        {
          target: 'username',
          type: 'text',
          placeholder: 'Username',
          icon: <bi.BiAt size={20} />,
          pattern: '[a-z0-9_-]{3,24}',
          autocomplete: 'username',
        },
        {
          target: 'email',
          type: 'email',
          placeholder: 'Email address',
          icon: <bi.BiEnvelope size={20} />,
          pattern: null,
          autocomplete: 'email',
        },
        {
          target: 'password',
          type: showPassword.password ? 'text' : 'password',
          placeholder: 'Password',
          icon: <bi.BiLockOpenAlt size={20} />,
          pattern: null,
          autocomplete: 'new-password',
        },
        {
          target: 'confirmPassword',
          type: showPassword.confirmPassword ? 'text' : 'password',
          placeholder: 'Confirm password',
          icon: <bi.BiLockOpenAlt size={20} />,
          pattern: null,
          autocomplete: 'new-password',
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
            autoComplete={elem.autocomplete}
            placeholder={elem.placeholder}
            className={`${
              form[elem.target].length > 0
                ? 'peer valid:border-emerald-400'
                : 'peer'
            } w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-11 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100`}
            pattern={elem.pattern}
            value={form[elem.target]}
            onChange={handleChange}
            required
          />
          {['password', 'confirmPassword'].includes(elem.target) ? (
            <button
              type="button"
              className="absolute right-3 rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              onClick={() =>
                setShowPassword((prev) => ({
                  ...prev,
                  [elem.target]: !prev[elem.target],
                }))
              }
              aria-label={
                showPassword[elem.target] ? 'Hide password' : 'Show password'
              }
            >
              {showPassword[elem.target] ? <bi.BiHide /> : <bi.BiShow />}
            </button>
          ) : (
            <>
              <bi.BiCheck className="absolute right-3 text-lg text-emerald-600 hidden peer-valid:block" />
              <bi.BiX className="absolute right-3 text-lg text-rose-600 hidden peer-invalid:block" />
            </>
          )}
        </label>
      ))}
      {/* notice of terms */}
      <span className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p>
          {`People who use our service may have uploaded your contact information to ${config.brandName}. `}
          <a href="/" className="font-semibold text-sky-700 hover:text-sky-900">
            Learn More
          </a>
        </p>
        <p className="mt-2">
          {'By signing up, you agree to our '}
          <a href="/" className="font-semibold text-sky-700 hover:text-sky-900">
            Terms
          </a>
          {', '}
          <a href="/" className="font-semibold text-sky-700 hover:text-sky-900">
            Privacy Policy
          </a>
          {' and '}
          <a href="/" className="font-semibold text-sky-700 hover:text-sky-900">
            Cookies Policy
          </a>
          {'. '}
        </p>
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
          <p>Create account</p>
        )}
      </button>
    </form>
  );
}

export default Register;
