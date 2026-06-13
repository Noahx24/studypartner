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

// Moodle's internal module types read as jargon — translate for students.
const TYPE_LABELS = {
  resource: 'File',
  folder: 'Folder',
  page: 'Course page',
  url: 'Link',
  assign: 'Assignment',
  quiz: 'Quiz',
};
const typeLabel = (t) => TYPE_LABELS[t] || 'File';

// A real Moodle course dumps hundreds of files — study guides and tutorial
// letters buried among course-page fragments (index.html), bare links, and
// empty pages. Rank by what a student actually feeds the AI so the useful
// material floats to the top of each module and the scaffolding sinks.
const STUDY_SIGNALS = [
  { re: /study\s*guide/i, score: 100, label: 'Study guide' },
  { re: /tutorial\s*letter|\btut(?:orial)?\s*\d|\btutorial\b/i, score: 90, label: 'Tutorial letter' },
  // Real past papers — not the bare word "exam", which also tags admin
  // folders like "Exam resources" (proctoring/invigilator guides).
  { re: /past\s*(?:paper|exam)|exam\s*paper|question\s*paper|\bmemo(?:randum)?\b/i, score: 80, label: 'Past paper' },
  { re: /learning\s*unit|\bunit\b|\bchapter\b|\[unit|lecture/i, score: 70, label: 'Lecture / unit' },
  { re: /\bnotes?\b|\bslides?\b/i, score: 60, label: 'Notes' },
];
const DOC_EXT = /\.(pdf|docx?|pptx?)$/i;

function rankMaterial(r) {
  const filename = r.filename || '';
  // Bury scaffolding: course-page HTML fragments, bare URL shortcuts, and
  // pages with no real file behind them.
  if (/index\.html?$/i.test(filename) || /\.url$/i.test(filename)) return { score: -100, label: null };
  if (r.type === 'page' && !r.filename) return { score: -80, label: null };

  const haystack = `${filename} ${r.title || ''}`.toLowerCase();
  for (const s of STUDY_SIGNALS) {
    if (s.re.test(haystack)) {
      return { score: s.score + (DOC_EXT.test(filename) ? 5 : 0), label: s.label };
    }
  }
  return { score: DOC_EXT.test(filename) ? 10 : 0, label: null };
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
      toast.success(`${res.count} file${res.count === 1 ? '' : 's'} ready to study from${skipped ? ` — ${skipped} couldn't be added` : ''}.`);
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
      const { score, label } = rankMaterial(r);
      const list = map.get(r.module_id) ?? { name: r.module_name, items: [] };
      list.items.push({ ...r, included, _rank: score, _label: label });
      map.set(r.module_id, list);
    }
    // Within each module: keep the student's own picks pinned at the top,
    // then suggested study material, then everything else, noise last.
    for (const v of map.values()) {
      v.items.sort((a, b) => {
        const pin = (i) => (i.included || i.ingested_at ? 1 : 0);
        return pin(b) - pin(a) || b._rank - a._rank || (a.filename || a.title).localeCompare(b.filename || b.title);
      });
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
    <div className="pb-44">
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
            <h1 className="font-heading text-2xl font-bold">Study materials</h1>
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
                  {/* The Moodle activity title ("Additional Resources") repeats
                      for every file in a folder — the filename is what the
                      student actually recognises, so lead with it. */}
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="block text-sm font-medium truncate">
                      {r.filename || r.title}
                    </span>
                    {r._label && (
                      <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5">
                        {r._label}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted-foreground mt-0.5 truncate">
                    {r.filename && r.filename !== r.title ? `${r.title} · ` : ''}
                    {typeLabel(r.type)}
                    {r.file_size ? ` · ${formatSize(r.file_size)}` : ''}
                    {r.ingested_at ? ' · added to AI' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {resources.length > 0 && (
        <div
          className="fixed left-0 right-0 z-50 border-t bg-background/95 backdrop-blur p-4"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
        >
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
              {dirty ? 'Save my choices' : 'Nothing to save'}
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
              Use {totalSelected} for studying
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
