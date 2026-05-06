import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, FileText, Loader2, ArrowLeft, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/api/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

function formatSize(bytes) {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Per-file picker for which Moodle materials feed the AI.
 *
 * Two-step UX:
 *   1. Tick checkboxes → "Save selection" persists `included_in_ai`.
 *   2. "Add N to AI" downloads bytes + runs ingestion, only for the
 *      ticked items that haven't been ingested before.
 *
 * Re-ingestion is idempotent — the backend skips anything with
 * `ingested_at` already set.
 */
export default function MoodleMaterials() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState({}); // resource_id -> bool

  const { data, isLoading } = useQuery({
    queryKey: ['moodle-materials'],
    queryFn: () => api.listMaterials(),
  });

  const sync = useMutation({
    mutationFn: () => api.moodleSync(),
    onSuccess: (res) => {
      toast.success(`Synced ${res.modules_synced} modules, ${res.assessments_synced} assessments.`);
      queryClient.invalidateQueries({ queryKey: ['moodle-materials'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const save = useMutation({
    mutationFn: () => {
      const include = Object.entries(pending).filter(([, v]) => v).map(([k]) => k);
      const exclude = Object.entries(pending).filter(([, v]) => !v).map(([k]) => k);
      return api.selectMaterials({ include, exclude });
    },
    onSuccess: () => {
      toast.success('Selection saved');
      setPending({});
      queryClient.invalidateQueries({ queryKey: ['moodle-materials'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const ingest = useMutation({
    mutationFn: () => api.ingestSelectedMaterials(),
    onSuccess: (res) => {
      const skipped = res.skipped?.length ?? 0;
      toast.success(`Added ${res.count} files to AI${skipped ? ` (${skipped} skipped)` : ''}`);
      queryClient.invalidateQueries({ queryKey: ['moodle-materials'] });
    },
    onError: (err) => toast.error(err.message),
  });

  const resources = data?.resources ?? [];

  const grouped = useMemo(() => {
    const map = new Map();
    for (const r of resources) {
      const next = pending[r.id];
      const included = next ?? r.included_in_ai;
      const list = map.get(r.module_id) ?? { name: r.module_name, items: [] };
      list.items.push({ ...r, included });
      map.set(r.module_id, list);
    }
    return [...map.entries()].map(([module_id, v]) => ({ module_id, ...v }));
  }, [resources, pending]);

  const totalSelected = useMemo(
    () => grouped.reduce((sum, g) => sum + g.items.filter((i) => i.included).length, 0),
    [grouped],
  );

  const dirty = Object.keys(pending).length > 0;

  const toggle = (id, current) => {
    setPending((prev) => ({ ...prev, [id]: !current }));
  };

  return (
    <div className="pb-32">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl"
            onClick={() => navigate('/modules')}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="font-heading text-2xl font-bold">Materials for AI</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {totalSelected} of {resources.length} selected
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => sync.mutate()}
          disabled={sync.isPending}
          className="rounded-xl"
        >
          {sync.isPending ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1" />
          )}
          Resync
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground py-12 text-center">
          Loading materials…
        </div>
      )}

      {!isLoading && resources.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1">Nothing imported yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Connect Moodle from the Modules page to pull in your courses and files.
          </p>
        </div>
      )}

      {grouped.map((g) => (
        <section key={g.module_id} className="mb-6">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {g.name}
          </div>
          <div className="rounded-xl border bg-card overflow-hidden">
            {g.items.map((r, i) => (
              <button
                key={r.id}
                onClick={() => toggle(r.id, r.included)}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30',
                  i > 0 && 'border-t',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2',
                    r.included
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted-foreground/40',
                  )}
                >
                  {r.included && <Check className="w-3 h-3" />}
                </span>
                <FileText className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{r.title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {r.type}
                    {r.file_size ? ` · ${formatSize(r.file_size)}` : ''}
                    {r.ingested_at ? ' · already added' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {resources.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 backdrop-blur p-4">
          <div className="max-w-2xl mx-auto flex gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => save.mutate()}
              disabled={!dirty || save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {dirty ? 'Save selection' : 'No changes'}
            </Button>
            <Button
              className="flex-1 rounded-xl"
              onClick={() => ingest.mutate()}
              disabled={ingest.isPending || totalSelected === 0}
            >
              {ingest.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 mr-2" />
              )}
              Add {totalSelected} to AI
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
