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

function SocialAuth({ setRespond, rememberValue = '', onTwoFactorRequired = null }) {
  const googleButtonRef = useRef(null);

  const [socialConfig, setSocialConfig] = useState({
    googleClientId: '',
    facebookAppId: '',
  });
  const [loadingProvider, setLoadingProvider] = useState('');
  const [facebookReady, setFacebookReady] = useState(false);

  const googleEnabled = !!socialConfig.googleClientId;
  const facebookEnabled = !!socialConfig.facebookAppId;

  useEffect(() => {
    let mounted = true;

    const loadConfig = async () => {
      try {
        const { data } = await axios.get('/users/social-config');
        if (!mounted) return;
        setSocialConfig({
          googleClientId: data?.payload?.googleClientId || '',
          facebookAppId: data?.payload?.facebookAppId || '',
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
      if (data?.payload?.requiresTwoFactor) {
        if (onTwoFactorRequired) {
          onTwoFactorRequired({
            tempToken: data.payload.tempToken,
            message: 'Enter your Google Authenticator code to continue.',
          });
        }
        return;
      }
      completeAuth(
        data?.payload?.token || data?.payload,
        payload?.username || payload?.email || ''
      );
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
          width: 150,
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

        if (!disposed && window.FB) setFacebookReady(true);
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

  return (
    <div className="mt-3 grid gap-3">
      <div className="relative">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200 dark:bg-spill-700" />
      </div>

      <div className="flex justify-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="relative shrink-0 min-w-[150px]">
          <button
            type="button"
            disabled={!googleEnabled || loadingProvider === 'google'}
            className="flex h-[54px] w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-spill-700 dark:bg-spill-900 dark:text-white/80 dark:hover:bg-spill-800"
          >
            <ri.RiGoogleFill size={18} />
            <span>{loadingProvider === 'google' ? 'Connecting...' : 'Google'}</span>
          </button>
          {googleEnabled && (
            <div
              className="absolute inset-0 grid place-items-center overflow-hidden opacity-0"
              ref={googleButtonRef}
            />
          )}
        </div>

        <button
          type="button"
          className="shrink-0 min-w-[150px] flex h-[54px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-spill-700 dark:bg-spill-900 dark:text-white/80 dark:hover:bg-spill-800"
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
          <ri.RiFacebookCircleFill size={19} />
          <span>{loadingProvider === 'facebook' ? 'Connecting...' : 'Facebook'}</span>
        </button>
      </div>

      {loadingProvider && (
        <p className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-white/60">
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
