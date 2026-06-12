import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { toast } from 'sonner';
import { api } from '@/api/client';

const PASSPORT_KEY = 'studypartner.moodle_passport';
const SCHEME_PREFIX = 'studypartner://';

/**
 * Catches the Moodle launch redirect when running inside a Capacitor shell.
 *
 * Moodle ends the launch flow by redirecting the system browser to
 * `studypartner://token=<base64-blob>`. iOS / Android, having seen our app
 * register that scheme, hand the URL straight to us via the
 * `appUrlOpen` event. We pair the token with the passport we stashed
 * before the launch, POST both to /moodle/launch/callback, kick off a
 * sync, and route the user to the materials picker.
 *
 * On a pure web build (`Capacitor.isNativePlatform() === false`) this
 * hook is a no-op. The web build can't catch a custom-scheme redirect;
 * the launch flow only completes inside a native shell.
 */
export function useMoodleDeepLink() {
  const navigate = useNavigate();
  const handlerRef = useRef(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let removeListener = null;
    let cancelled = false;

    const handle = async (url) => {
      if (!url || !url.toLowerCase().startsWith(SCHEME_PREFIX)) return;
      // The same scheme also carries the password-reset deep link
      // (studypartner://reset-password?token=...), handled separately by
      // useResetPasswordDeepLink — ignore it here.
      if (url.toLowerCase().startsWith('studypartner://reset-password')) return;

      // Strip the scheme. Moodle emits `studypartner://token=<blob>` with
      // no host segment, so what's left is the parameter list.
      const params = new URLSearchParams(url.slice(SCHEME_PREFIX.length));
      const token = params.get('token');
      const passport = localStorage.getItem(PASSPORT_KEY);

      if (!token) {
        toast.error("Moodle didn't return a token. Try connecting again.");
        return;
      }
      if (!passport) {
        toast.error('Launch session expired. Please connect again.');
        return;
      }

      try {
        const res = await api.moodleLaunchCallback({ passport, token });
        localStorage.removeItem(PASSPORT_KEY);
        if (cancelled) return;
        toast.success(`Connected to ${res.sitename || 'Moodle'}`);
        try {
          await api.moodleSync();
        } catch (syncErr) {
          toast.error(syncErr.message || 'First sync failed; you can retry.');
        }
        if (!cancelled) navigate('/modules/materials');
      } catch (err) {
        localStorage.removeItem(PASSPORT_KEY);
        toast.error(err.message || 'Could not finalise the Moodle connection.');
      }
    };

    handlerRef.current = handle;

    // Cold-start: the URL that launched the app (if any).
    App.getLaunchUrl()
      .then((res) => {
        if (res && res.url) handle(res.url);
      })
      .catch(() => {});

    // Warm-resume: the app is already running and the OS hands us a URL.
    App.addListener('appUrlOpen', (event) => handle(event.url)).then(
      (sub) => {
        removeListener = sub;
      },
    );

    return () => {
      cancelled = true;
      if (removeListener && typeof removeListener.remove === 'function') {
        removeListener.remove();
      }
    };
  }, [navigate]);
}
