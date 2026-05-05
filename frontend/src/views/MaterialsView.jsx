import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Icon } from '../ui/Icon';
import { Card, Screen, ScreenHeader, IconBtn } from '../ui/primitives';
import { P, MONO } from '../ui/tokens';

/**
 * MaterialsView — after a Moodle sync, the user picks which auto-imported
 * files (PDFs, slides, notes) feed into AI processing. Resources are
 * grouped by module; the user toggles each one and hits "Add to AI" to
 * download + ingest only those.
 */
export function MaterialsView({ onBack, onIngested }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [pendingChanges, setPendingChanges] = useState({}); // id -> bool

  const load = () => {
    setLoading(true);
    api.listMaterials()
      .then((res) => {
        setResources(res.resources);
        setPendingChanges({});
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggle = (id, current) => {
    setPendingChanges((p) => ({ ...p, [id]: !current }));
  };

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of resources) {
      const next = pendingChanges[r.id];
      const included = next ?? r.included_in_ai;
      const list = map.get(r.module_id) ?? { name: r.module_name, items: [] };
      list.items.push({ ...r, included });
      map.set(r.module_id, list);
    }
    return [...map.entries()].map(([module_id, v]) => ({ module_id, ...v }));
  }, [resources, pendingChanges]);

  const totalSelected = useMemo(
    () => grouped.reduce((sum, g) => sum + g.items.filter((i) => i.included).length, 0),
    [grouped],
  );

  const save = async () => {
    if (Object.keys(pendingChanges).length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const include = Object.entries(pendingChanges).filter(([, v]) => v).map(([k]) => k);
      const exclude = Object.entries(pendingChanges).filter(([, v]) => !v).map(([k]) => k);
      await api.selectMaterials({ include, exclude });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const runIngest = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.ingestSelectedMaterials();
      load();
      onIngested?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dirty = Object.keys(pendingChanges).length > 0;

  return (
    <Screen>
      <ScreenHeader
        subtitle="STUDY MATERIALS"
        title={`Pick what to feed the AI (${totalSelected})`}
        right={
          <IconBtn size={36} aria-label="Back" onClick={onBack}>
            <Icon name="close" size={18} color={P.ink} />
          </IconBtn>
        }
      />

      <div className="px-4 pb-32">
        {error && (
          <div
            className="mb-3 rounded-card px-3 py-2 text-[13px]"
            style={{ background: P.coralSoft, color: P.coralDeep }}
          >
            {error}
          </div>
        )}

        {loading && <div className="text-ink3">Loading materials…</div>}

        {!loading && grouped.length === 0 && (
          <Card>
            <div className="text-[15px] text-ink2">
              Nothing imported from Moodle yet. Connect Moodle from{' '}
              <span className="font-semibold">Settings</span> and run a sync to
              see your course files here.
            </div>
          </Card>
        )}

        {grouped.map((g) => (
          <section key={g.module_id} className="mb-5">
            <div
              className="mb-2 mono text-[11px] font-bold uppercase tracking-wider text-ink3"
              style={{ fontFamily: MONO }}
            >
              {g.name}
            </div>
            <Card pad={0}>
              {g.items.map((r, i) => (
                <button
                  key={r.id}
                  onClick={() => toggle(r.id, r.included)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-black/[0.02]"
                  style={{
                    borderTop: i === 0 ? 'none' : `1px solid ${P.line}`,
                  }}
                >
                  <span
                    className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-md"
                    style={{
                      background: r.included ? P.ink : 'transparent',
                      border: `1.5px solid ${r.included ? P.ink : P.ink3}`,
                    }}
                  >
                    {r.included && <Icon name="check" size={12} color={P.surface} />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14px] font-medium text-ink">{r.title}</span>
                    <span className="mt-0.5 block text-[11px] text-ink3">
                      {r.type}
                      {r.file_size ? ` · ${formatSize(r.file_size)}` : ''}
                      {r.ingested_at ? ' · already added' : ''}
                    </span>
                  </span>
                </button>
              ))}
            </Card>
          </section>
        ))}
      </div>

      <div
        className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 px-4 pb-6 pt-3"
        style={{ background: `linear-gradient(to top, ${P.bg} 70%, ${P.bg}00)` }}
      >
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={!dirty || busy}
            className="flex-1 rounded-card px-4 py-3 text-[14px] font-semibold disabled:opacity-50"
            style={{ background: P.surface, border: `1px solid ${P.line}`, color: P.ink }}
          >
            {busy ? 'Saving…' : dirty ? 'Save selection' : 'No changes'}
          </button>
          <button
            onClick={runIngest}
            disabled={busy || totalSelected === 0}
            className="flex-1 rounded-card px-4 py-3 text-[14px] font-semibold disabled:opacity-50"
            style={{ background: P.ink, color: P.surface }}
          >
            Add {totalSelected} to AI
          </button>
        </div>
      </div>
    </Screen>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
