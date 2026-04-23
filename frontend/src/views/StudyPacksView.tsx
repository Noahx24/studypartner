import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { downloadAndStorePack, usePackStatus } from '../hooks/usePack';
import { packsRepo } from '../db/repos';
import type { PackPayload, PackStatusResponse } from '../types';

type Props = {
  userId: string;
  moduleId: string;
  activeSelectionId?: string | null;
  onOpenPack: (pack_id: string, payload: PackPayload) => void;
};

export function StudyPacksView({ userId, moduleId, activeSelectionId, onOpenPack }: Props) {
  const [packs, setPacks] = useState<PackStatusResponse[]>([]);
  const [activePackId, setActivePackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const { status } = usePackStatus(activePackId);

  useEffect(() => {
    let cancelled = false;
    api
      .listPacks(moduleId, userId)
      .then((res) => !cancelled && setPacks(res.packs))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to list packs'));
    return () => {
      cancelled = true;
    };
  }, [moduleId, userId, status?.status]);

  const generate = async () => {
    if (!activeSelectionId) {
      setError('Save a selection first');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await api.generatePack({ user_id: userId, selection_id: activeSelectionId });
      setActivePackId(res.pack_id);
      await packsRepo.upsertMeta({
        id: res.pack_id,
        module_id: moduleId,
        user_id: userId,
        selection_id: activeSelectionId,
        status: 'generating',
        version: 1,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate pack');
    } finally {
      setGenerating(false);
    }
  };

  const downloadAndOpen = async (pack_id: string) => {
    setError(null);
    try {
      const payload = await downloadAndStorePack(pack_id);
      onOpenPack(pack_id, payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">Study packs</h2>
      {error && <div className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <article className="card flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">Generate a new pack from your selection</p>
          <p className="text-xs text-slate-400">Runs AI once. Download for offline use.</p>
        </div>
        <button className="btn-primary" disabled={generating || !activeSelectionId} onClick={generate}>
          {generating ? 'Queuing…' : 'Generate'}
        </button>
      </article>

      {activePackId && status && (
        <article className="card text-sm text-slate-700">
          <p>
            Pack <code className="text-xs">{activePackId.slice(0, 8)}</code> · status: <strong>{status.status}</strong>
          </p>
          {status.status === 'generated' && (
            <button className="btn-secondary mt-2" onClick={() => downloadAndOpen(activePackId)}>
              Download & open
            </button>
          )}
          {status.status === 'failed' && <p className="text-rose-600">Error: {status.error}</p>}
        </article>
      )}

      {packs.length === 0 ? (
        <p className="text-sm text-slate-500">No packs yet.</p>
      ) : (
        packs.map((p) => (
          <article key={p.id} className="card flex items-center justify-between text-sm">
            <div>
              <p className="font-medium text-slate-800">v{p.version}</p>
              <p className="text-xs text-slate-500">
                {p.status}
                {p.byte_size ? ` · ${Math.round(p.byte_size / 1024)} KB` : ''}
                {p.generated_at ? ` · ${new Date(p.generated_at).toLocaleString()}` : ''}
              </p>
            </div>
            {p.status === 'generated' && (
              <button className="btn-secondary" onClick={() => downloadAndOpen(p.id)}>
                Download
              </button>
            )}
          </article>
        ))
      )}
    </section>
  );
}
