import { useCallback, useEffect, useState } from 'react';
import { inflate } from 'pako';
import { api } from '../api/client';
import { packsRepo } from '../db/repos';
import type { PackPayload, PackStatusResponse } from '../types';

export function usePackStatus(pack_id: string | null, poll = true) {
  const [status, setStatus] = useState<PackStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!pack_id) return;
    try {
      const s = await api.getPackStatus(pack_id);
      setStatus(s);
      await packsRepo.setStatus(pack_id, s.status as any);
      setError(null);
      return s;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status check failed');
      return null;
    }
  }, [pack_id]);

  useEffect(() => {
    if (!pack_id) return;
    void refresh();
    if (!poll) return;
    const handle = setInterval(() => {
      void refresh().then((s) => {
        if (s && (s.status === 'generated' || s.status === 'failed')) clearInterval(handle);
      });
    }, 2000);
    return () => clearInterval(handle);
  }, [pack_id, poll, refresh]);

  return { status, error, refresh };
}

export async function downloadAndStorePack(pack_id: string): Promise<PackPayload> {
  const { bytes, etag } = await api.downloadPackBytes(pack_id);
  await packsRepo.saveBlob({
    pack_id,
    bytes,
    etag: etag ?? undefined,
    downloaded_at: new Date().toISOString(),
  });
  await packsRepo.setStatus(pack_id, 'downloaded');
  return decodePack(bytes);
}

export async function loadLocalPack(pack_id: string): Promise<PackPayload | null> {
  const blob = await packsRepo.loadBlob(pack_id);
  if (!blob) return null;
  return decodePack(blob.bytes);
}

function decodePack(bytes: Uint8Array): PackPayload {
  const inflated = inflate(bytes, { to: 'string' });
  return JSON.parse(inflated) as PackPayload;
}
