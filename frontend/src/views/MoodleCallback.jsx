import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';
import { toast } from 'sonner';

const PASSPORT_KEY = 'studypartner.moodle_passport';

/**
 * Lands when Moodle redirects back from the mobile-launch flow.
 *
 * Moodle appends `token=<base64>` directly to whatever urlscheme we
 * sent it. The passport we stored in localStorage right before the
 * launch is paired with this token to complete the handshake.
 */
export default function MoodleCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState('working'); // 'working' | 'done' | 'error'
  const [error, setError] = useState(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = params.get('token');
    const passport = localStorage.getItem(PASSPORT_KEY);

    if (!token) {
      setState('error');
      setError('Moodle didn’t return a token. Try again from Modules.');
      return;
    }
    if (!passport) {
      setState('error');
      setError('We lost track of your launch session. Please try connecting again.');
      return;
    }

    api.moodleLaunchCallback({ passport, token })
      .then(async (res) => {
        localStorage.removeItem(PASSPORT_KEY);
        toast.success(`Connected to ${res.sitename || 'Moodle'}`);
        // Auto-sync on first connect so the user immediately sees their courses.
        try {
          await api.moodleSync();
        } catch (syncErr) {
          // Not fatal — they can retry from Modules.
          toast.error(syncErr.message || 'First sync failed; you can retry.');
        }
        setState('done');
        setTimeout(() => navigate('/modules/materials', { replace: true }), 600);
      })
      .catch((err) => {
        setState('error');
        setError(err.message || 'Something went wrong completing the connection.');
        localStorage.removeItem(PASSPORT_KEY);
      });
  }, [params, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full text-center space-y-4">
        {state === 'working' && (
          <>
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
            <h1 className="font-heading text-xl font-semibold">Finalising your Moodle connection…</h1>
            <p className="text-sm text-muted-foreground">
              We're verifying the token Moodle returned and pulling in your modules.
            </p>
          </>
        )}
        {state === 'done' && (
          <>
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
            <h1 className="font-heading text-xl font-semibold">All set</h1>
            <p className="text-sm text-muted-foreground">Taking you to your materials…</p>
          </>
        )}
        {state === 'error' && (
          <>
            <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
            <h1 className="font-heading text-xl font-semibold">Couldn't connect to Moodle</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate('/modules')}>
                Back to Modules
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
