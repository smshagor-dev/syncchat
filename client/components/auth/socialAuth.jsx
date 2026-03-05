import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import * as bi from 'react-icons/bi';
import * as ri from 'react-icons/ri';

const loadExternalScript = ({ id, src }) =>
  new Promise((resolve, reject) => {
    const existing = document.getElementById(id);
    if (existing) {
      if (existing.getAttribute('data-loaded') === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error(`Failed to load script: ${src}`)),
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.setAttribute('data-loaded', '1');
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(script);
  });

function SocialAuth({ setRespond, rememberValue = '' }) {
  const googleButtonRef = useRef(null);
  const telegramButtonRef = useRef(null);

  const [socialConfig, setSocialConfig] = useState({
    googleClientId: '',
    facebookAppId: '',
    telegramBotUsername: '',
  });
  const [loadingProvider, setLoadingProvider] = useState('');
  const [facebookReady, setFacebookReady] = useState(false);

  const googleEnabled = !!socialConfig.googleClientId;
  const facebookEnabled = !!socialConfig.facebookAppId;
  const telegramEnabled = !!socialConfig.telegramBotUsername;

  useEffect(() => {
    let mounted = true;

    const loadConfig = async () => {
      try {
        const { data } = await axios.get('/users/social-config');
        if (!mounted) return;
        setSocialConfig({
          googleClientId: data?.payload?.googleClientId || '',
          facebookAppId: data?.payload?.facebookAppId || '',
          telegramBotUsername: data?.payload?.telegramBotUsername || '',
        });
      } catch (error0) {
        if (!mounted) return;
        setRespond({
          success: false,
          message: error0?.response?.data?.message || error0.message,
        });
      }
    };

    loadConfig();

    return () => {
      mounted = false;
    };
  }, [setRespond]);

  const completeAuth = (token, cacheValue = '') => {
    localStorage.setItem('token', token);
    localStorage.setItem(
      'cache',
      JSON.stringify({
        me: cacheValue || rememberValue || null,
      })
    );
    setTimeout(() => window.location.reload(), 800);
  };

  const doSocialAuth = async (provider, payload) => {
    try {
      setLoadingProvider(provider);
      const { data } = await axios.post('/users/social-auth', { provider, payload });
      setRespond({ success: true, message: data.message });
      completeAuth(data.payload, payload?.username || payload?.email || '');
    } catch (error0) {
      setRespond({
        success: false,
        message:
          error0?.response?.data?.message ||
          `Unable to authenticate with ${provider}`,
      });
    } finally {
      setLoadingProvider('');
    }
  };

  useEffect(() => {
    if (!googleEnabled || !googleButtonRef.current) return undefined;
    let disposed = false;

    const setupGoogle = async () => {
      try {
        await loadExternalScript({
          id: 'google-identity-services',
          src: 'https://accounts.google.com/gsi/client',
        });
        if (disposed || !window.google?.accounts?.id) return;

        window.google.accounts.id.initialize({
          client_id: socialConfig.googleClientId,
          callback: (response) => {
            if (!response?.credential) {
              setRespond({ success: false, message: 'Google sign-in failed' });
              return;
            }
            doSocialAuth('google', { credential: response.credential });
          },
        });

        googleButtonRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          theme: 'outline',
          size: 'medium',
          text: 'continue_with',
          shape: 'pill',
          width: 116,
        });
      } catch (error0) {
        setRespond({
          success: false,
          message: error0?.message || 'Google script load failed',
        });
      }
    };

    setupGoogle();

    return () => {
      disposed = true;
    };
  }, [googleEnabled, setRespond, socialConfig.googleClientId]);

  useEffect(() => {
    if (!facebookEnabled) return undefined;
    let disposed = false;

    const setupFacebook = async () => {
      try {
        window.fbAsyncInit = () => {
          if (disposed || !window.FB) return;
          window.FB.init({
            appId: socialConfig.facebookAppId,
            cookie: false,
            xfbml: false,
            version: 'v19.0',
          });
          setFacebookReady(true);
        };

        await loadExternalScript({
          id: 'facebook-jssdk',
          src: 'https://connect.facebook.net/en_US/sdk.js',
        });

        if (!disposed && window.FB) {
          setFacebookReady(true);
        }
      } catch (error0) {
        setRespond({
          success: false,
          message: error0?.message || 'Facebook script load failed',
        });
      }
    };

    setupFacebook();

    return () => {
      disposed = true;
    };
  }, [facebookEnabled, setRespond, socialConfig.facebookAppId]);

  useEffect(() => {
    if (!telegramEnabled || !telegramButtonRef.current) return undefined;

    const callbackName = '__syncChatTelegramAuth';
    window[callbackName] = (user) => {
      doSocialAuth('telegram', { telegram: user });
    };

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', socialConfig.telegramBotUsername);
    script.setAttribute('data-size', 'small');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', `${callbackName}(user)`);

    telegramButtonRef.current.innerHTML = '';
    telegramButtonRef.current.appendChild(script);

    return () => {
      delete window[callbackName];
    };
  }, [telegramEnabled, socialConfig.telegramBotUsername]);

  return (
    <div className="mt-3 grid gap-3">
      <div className="relative">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" />
        <p className="relative mx-auto w-fit bg-white px-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">
          Continue with
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="shrink-0 min-w-[122px] rounded-xl border border-slate-300 bg-white p-2">
          {googleEnabled ? (
            <div className="flex justify-center" ref={googleButtonRef} />
          ) : (
            <button
              type="button"
              disabled
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400"
            >
              <ri.RiGoogleFill size={18} />
              <span>Google</span>
            </button>
          )}
        </div>

        <button
          type="button"
          className="shrink-0 min-w-[122px] flex h-[54px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            if (!window.FB) return;
            window.FB.login(
              (response) => {
                const token = response?.authResponse?.accessToken;
                if (!token) {
                  setRespond({
                    success: false,
                    message: 'Facebook sign-in cancelled',
                  });
                  return;
                }
                doSocialAuth('facebook', { accessToken: token });
              },
              { scope: 'public_profile,email' }
            );
          }}
          disabled={
            !facebookEnabled || !facebookReady || loadingProvider === 'facebook'
          }
        >
          <i>
            <ri.RiFacebookCircleFill size={19} />
          </i>
          <span>{loadingProvider === 'facebook' ? 'Connecting...' : 'Facebook'}</span>
        </button>

        <div className="shrink-0 min-w-[122px] rounded-xl border border-slate-300 bg-white p-2">
          {telegramEnabled ? (
            <div ref={telegramButtonRef} className="grid place-items-center" />
          ) : (
            <button
              type="button"
              disabled
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-400"
            >
              <ri.RiTelegramFill size={18} />
              <span>Telegram</span>
            </button>
          )}
        </div>
      </div>

      {loadingProvider && (
        <p className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <i className="animate-spin">
            <bi.BiLoaderAlt />
          </i>
          <span>Processing {loadingProvider} sign-in...</span>
        </p>
      )}
    </div>
  );
}

export default SocialAuth;
