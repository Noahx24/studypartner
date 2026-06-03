import { useEffect, useState } from 'react';

import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

import { db } from '../db/schema';

/**
 * Live count of queued sync ops. Uses a cheap 3s interval — the outbox is
 * only mutated by local writes, so we don't need push updates.
 *
 * Pauses the poll when:
 *   - Native Capacitor app is backgrounded (battery drain on idle
 *     iPhones / Android phones — iOS in particular kills foreground
 *     timers behind the lock screen anyway).
 *   - Browser tab is hidden (battery on web).
 * Resumes immediately on foreground / visibility-restore so the
 * badge isn't stale when the user comes back.
 */
export function useOutboxCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let handle: ReturnType<typeof setInterval> | null = null;

    const read = async () => {
      try {
        const n = await db.outbox.count();
        if (!cancelled) setCount(n);
      } catch {
        // IndexedDB can reject when the tab is being torn down; ignore.
      }
    };

    const startPoll = () => {
      if (handle != null) return;
      void read();  // refresh immediately on foreground
      handle = setInterval(() => void read(), 3000);
    };

    const stopPoll = () => {
      if (handle != null) {
        clearInterval(handle);
        handle = null;
      }
    };

    // Initial state: visible/foreground → poll, hidden → don't.
    if (typeof document === 'undefined' || !document.hidden) {
      startPoll();
    }

    const onVisibility = () => {
      if (document.hidden) stopPoll();
      else startPoll();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }

    // Capacitor appStateChange fires on native iOS/Android with
    // {isActive: boolean}. On web the listener is a no-op.
    let nativeRemove: (() => void) | null = null;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) startPoll();
        else stopPoll();
      }).then((sub) => {
        nativeRemove = () => {
          if (typeof sub.remove === 'function') sub.remove();
        };
      }).catch(() => {});
    }

    return () => {
      cancelled = true;
      stopPoll();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
      if (nativeRemove) nativeRemove();
    };
  }, []);

  return count;
}
