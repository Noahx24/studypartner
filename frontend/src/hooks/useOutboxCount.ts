import { useEffect, useState } from 'react';
import { db } from '../db/schema';

/**
 * Live count of queued sync ops. Uses a cheap 3s interval — the outbox is
 * only mutated by local writes, so we don't need push updates.
 */
export function useOutboxCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      try {
        const n = await db.outbox.count();
        if (!cancelled) setCount(n);
      } catch {
        // IndexedDB can reject when the tab is being torn down; ignore.
      }
    };

    void read();
    const handle = setInterval(() => void read(), 3000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  return count;
}
