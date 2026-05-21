import React, { useState } from 'react';
import { Cloud, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';
import { toast } from 'sonner';

const PASSPORT_KEY = 'studypartner.moodle_passport';

/**
 * Single CTA that kicks off the Moodle mobile-launch flow.
 *
 * Flow:
 *   1. Ask backend for a launch URL bound to a fresh passport. We send
 *      a bare URI-scheme name (`studypartner`); Moodle's tool_mobile
 *      builds the return target as `studypartner://token=<blob>`.
 *   2. Stash the passport in localStorage so the deep-link handler can
 *      pair it with the token when the OS opens the app back up.
 *   3. Redirect the browser to Moodle for SSO.
 *
 * The redirect Moodle issues at the end of the flow is a custom-scheme
 * URL. Only a native shell (Capacitor) that registers `studypartner://`
 * with the OS can catch it; on web-only the OS will fail to open the
 * URL. Moodle core does not accept `https://` callbacks here.
 */
const URLSCHEME = 'studypartner';

export default function FetchFromMyModulesButton({ className }) {
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const { launch_url, passport } = await api.moodleLaunch({
        urlscheme: URLSCHEME,
      });
      localStorage.setItem(PASSPORT_KEY, passport);
      if (Capacitor.isNativePlatform()) {
        // Open in the system browser so the school's SSO cookies live
        // in the user's normal browser context, then let the OS route
        // the studypartner:// redirect back via useMoodleDeepLink().
        await Browser.open({ url: launch_url });
      } else {
        // Web-only: navigate the current tab. Won't complete the flow
        // (no app to receive the custom-scheme redirect) but at least
        // makes the protocol failure visible to the user.
        window.location.assign(launch_url);
      }
    } catch (err) {
      toast.error(err.message || 'Could not start the Moodle connection.');
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={start}
      disabled={busy}
      className={className ?? 'rounded-xl'}
    >
      {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
      Fetch from myModules
    </Button>
  );
}
