import { WifiOff } from 'lucide-react';

import { useOnline } from '@/hooks/useOnline';

/**
 * Sticky banner shown when the browser reports offline.
 *
 * The visual is intentionally calm: users on patchy 3G see this all
 * the time, and a red alarm bar trains them to ignore it. Amber
 * background, single icon, one short sentence. Sits inside the safe
 * area so it doesn't overlap the iOS status bar.
 */
export default function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 shadow-sm"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
    >
      <WifiOff className="h-4 w-4" aria-hidden="true" />
      <span>You're offline. Changes will sync when you reconnect.</span>
    </div>
  );
}
