import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

const SCHEME_PREFIX = 'studypartner://reset-password';

/**
 * Catches the password-reset deep link when running inside a Capacitor shell.
 *
 * The /users/password/forgot email links to
 * `studypartner://reset-password?token=<token>` (see
 * STUDYPARTNER_PASSWORD_RESET_URL). The OS hands that URL to us via
 * `appUrlOpen`; we pull the token out and route to the in-app reset
 * screen, which posts it to /users/password/reset.
 *
 * No-op on a pure web build, where the custom scheme can't be caught.
 */
export function useResetPasswordDeepLink() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener = null;

    const handle = (url) => {
      if (!url || !url.toLowerCase().startsWith(SCHEME_PREFIX)) return;
      const qIndex = url.indexOf('?');
      const params = new URLSearchParams(qIndex >= 0 ? url.slice(qIndex + 1) : '');
      const token = params.get('token');
      if (token) navigate(`/reset-password?token=${encodeURIComponent(token)}`);
    };

    App.getLaunchUrl()
      .then((res) => res && res.url && handle(res.url))
      .catch(() => {});

    App.addListener('appUrlOpen', (event) => handle(event.url)).then((sub) => {
      removeListener = sub;
    });

    return () => {
      if (removeListener && typeof removeListener.remove === 'function') {
        removeListener.remove();
      }
    };
  }, [navigate]);
}
