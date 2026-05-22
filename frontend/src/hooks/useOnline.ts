import { useEffect, useState } from 'react';

/**
 * Tracks the browser's online/offline status.
 *
 * `navigator.onLine` is a soft signal — it reports "online" any time
 * the OS has a network interface up, even when the actual route to
 * the API is broken. For a hard signal you'd ping a known endpoint
 * on a timer; this hook is good enough for the "you appear to be
 * offline" UX cue.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => {
    if (typeof navigator === 'undefined') return true;
    return navigator.onLine;
  });

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
