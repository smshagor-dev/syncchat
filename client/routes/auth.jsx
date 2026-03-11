import React, { useState } from 'react';
import * as comp from '../components/auth';
import config from '../config';

function Auth() {
  const linkToken =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('link') || ''
      : '';
  const [respond, setRespond] = useState({ success: true, message: null });
  const [login, setLogin] = useState(true);
  const [forgotPass, setForgotPass] = useState(false);
  const [linkDevice, setLinkDevice] = useState(!!linkToken);
  let title = 'Sign up';
  let badgeLabel = 'Create account';
  if (linkDevice) title = 'Link device';
  else if (forgotPass) title = 'Forgot password';
  else if (login) title = 'Sign in';
  if (linkDevice) badgeLabel = 'Companion';
  else if (forgotPass) badgeLabel = 'Recovery';
  else if (login) badgeLabel = 'Sign in';

  let form = <comp.register setRespond={setRespond} />;
  if (linkDevice) {
    form = (
      <comp.linkDevice
        setRespond={setRespond}
        initialToken={linkToken}
        onBack={() => {
          setLinkDevice(false);
          setRespond({ success: true, message: null });
          if (window.history?.replaceState) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
      />
    );
  } else if (forgotPass) {
    form = (
      <comp.forgotPass
        setRespond={setRespond}
        onBackToLogin={() => {
          setForgotPass(false);
          setRespond({ success: true, message: null });
        }}
      />
    );
  } else if (login) {
    form = (
      <comp.login
        setRespond={setRespond}
        onForgotPass={() => {
          setForgotPass(true);
          setRespond({ success: true, message: null });
        }}
      />
    );
  }

  return (
    <div className="absolute inset-0 overflow-auto bg-slate-950 font-auth text-slate-100">
      <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-cyan-500/30 blur-3xl" />
      <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="absolute bottom-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-teal-500/20 blur-3xl" />

      <div className="relative mx-auto grid min-h-full w-full max-w-6xl grid-cols-1 items-center gap-8 px-4 py-8 md:px-8 lg:grid-cols-[1.1fr_1fr]">
        <section className="hidden rounded-3xl border border-cyan-300/30 bg-slate-900/70 p-10 lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-200">
            Secure Communication Suite
          </p>
          <h1 className="mt-4 max-w-md bg-gradient-to-r from-white via-cyan-100 to-sky-200 bg-clip-text font-authDisplay text-5xl leading-tight text-transparent">
            Work faster with a premium messaging experience.
          </h1>
          <p className="mt-4 max-w-lg text-slate-100">
            Unified inbox, realtime collaboration, and enterprise-grade privacy
            controls designed for modern teams.
          </p>
          <div className="mt-8 grid gap-3 text-sm text-slate-100">
            <span className="flex items-center gap-3 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3">
              <i className="h-2 w-2 rounded-full bg-emerald-400" />
              Live status and smart presence indicators
            </span>
            <span className="flex items-center gap-3 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3">
              <i className="h-2 w-2 rounded-full bg-cyan-400" />
              End-to-end secure account access and recovery
            </span>
            <span className="flex items-center gap-3 rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3">
              <i className="h-2 w-2 rounded-full bg-sky-400" />
              Built for desktop and mobile workflows
            </span>
          </div>
        </section>

        <section className="w-full max-w-xl justify-self-center rounded-3xl border border-slate-200/80 bg-white/95 p-5 text-slate-800 shadow-2xl shadow-slate-900/20 backdrop-blur-md sm:p-8">
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
              {badgeLabel}
            </span>
          </div>

          <div
            className={`${
              forgotPass || linkDevice ? 'hidden ' : ''
            } mb-6 grid grid-cols-2 rounded-xl bg-slate-100 p-1`}
          >
            <button
              type="button"
              className={`${
                login
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              } rounded-lg px-3 py-2 text-sm font-semibold transition`}
              onClick={() => {
                setLogin(true);
                setRespond({ success: true, message: null });
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className={`${
                !login
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              } rounded-lg px-3 py-2 text-sm font-semibold transition`}
              onClick={() => {
                setLogin(false);
                setRespond({ success: true, message: null });
              }}
            >
              Sign up
            </button>
          </div>

          <div className="mb-4">
            <h2 className="font-authDisplay text-2xl font-semibold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {linkDevice
                ? 'Scan a QR or enter a short code from your signed-in device.'
                : forgotPass
                ? 'Verify your identity and set a new password.'
                : 'Access your secure Space in seconds.'}
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

          <div className="transition duration-150">{form}</div>

          <div className={`${forgotPass || linkDevice ? 'hidden ' : ''} pt-5`}>
            <p className="text-center text-sm text-slate-500">
              <span>
                {login ? "Don't have an account? " : 'Have an account? '}
              </span>
              <button
                type="button"
                className="font-semibold text-sky-700 hover:text-sky-900 hover:underline"
                onClick={() => {
                  setRespond({ success: true, message: null });
                  setLogin((prev) => !prev);
                }}
              >
                {login ? 'Create one now' : 'Sign in instead'}
              </button>
            </p>
            <p className="mt-3 text-center text-sm text-slate-500">
              <button
                type="button"
                className="font-semibold text-sky-700 hover:text-sky-900 hover:underline"
                onClick={() => {
                  setRespond({ success: true, message: null });
                  setLinkDevice(true);
                }}
              >
                Link a device with QR or code
              </button>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Auth;
