import React, { useState } from 'react';
import { Cloud, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';
import { toast } from 'sonner';

const PASSPORT_KEY = 'studypartner.moodle_passport';

/**
 * Single CTA that kicks off the Moodle mobile-launch flow.
 *
 * Flow:
 *   1. Ask backend for a launch URL bound to a fresh passport.
 *   2. Stash the passport in localStorage so the callback page can use it.
 *   3. Redirect the browser to Moodle. The user signs in via the school's
 *      SSO; Moodle redirects back to /moodle/callback?token=… where the
 *      MoodleCallback view finishes the handshake.
 *
 * No paste fallback — if Moodle rejects our urlscheme this surfaces as
 * an error and the user retries.
 */
export default function FetchFromMyModulesButton({ className }) {
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const callback = `${window.location.origin}/moodle/callback?`;
      const { launch_url, passport } = await api.moodleLaunch({
        urlscheme: callback,
      });
      localStorage.setItem(PASSPORT_KEY, passport);
      window.location.assign(launch_url);
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
