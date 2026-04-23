import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { AIFeatureToggles, ModuleStructure } from '../types';

type Props = {
  userId: string;
  moduleId: string;
  onSelectionSaved: (selectionId: string, subtopicCount: number) => void;
};

export function SelectionView({ userId, moduleId, onSelectionSaved }: Props) {
  const [structure, setStructure] = useState<ModuleStructure | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [features, setFeatures] = useState<AIFeatureToggles>({
    summaries: true,
    subtopic_quiz: true,
    topic_quiz: true,
  });
  const [lowData, setLowData] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getModuleStructure(moduleId)
      .then((s) => {
        if (cancelled) return;
        setStructure(s);
        // Default: all subtopics selected
        setSelected(new Set(s.learning_units.flatMap((lu) => lu.subtopics.map((st) => st.id))));
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Failed to load module structure'));
    return () => {
      cancelled = true;
    };
  }, [moduleId]);

  const totalWords = useMemo(() => {
    if (!structure) return 0;
    return structure.learning_units
      .flatMap((lu) => lu.subtopics)
      .filter((s) => selected.has(s.id))
      .reduce((sum, s) => sum + s.word_count, 0);
  }, [structure, selected]);

  const toggleSub = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLU = (luId: string) => {
    if (!structure) return;
    const lu = structure.learning_units.find((x) => x.id === luId);
    if (!lu) return;
    const allIn = lu.subtopics.every((s) => selected.has(s.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of lu.subtopics) {
        if (allIn) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });
  };

  const save = async () => {
    if (selected.size === 0) {
      setError('Select at least one subtopic');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.saveSelection({
        user_id: userId,
        module_id: moduleId,
        subtopic_ids: Array.from(selected),
        ai_features: features,
        low_data_mode: lowData,
      });
      onSelectionSaved(res.selection_id, selected.size);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save selection');
    } finally {
      setLoading(false);
    }
  };

  if (!structure) {
    return <p className="text-sm text-slate-500">Loading module structure…</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">What to study</h2>
      {error && <div className="rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <article className="card space-y-3">
        <p className="text-sm text-slate-500">AI features</p>
        <Toggle label="Summaries" value={features.summaries} onChange={(v) => setFeatures((f) => ({ ...f, summaries: v }))} />
        <Toggle label="Subtopic quizzes" value={features.subtopic_quiz} onChange={(v) => setFeatures((f) => ({ ...f, subtopic_quiz: v }))} />
        <Toggle label="Topic-level quiz" value={features.topic_quiz} onChange={(v) => setFeatures((f) => ({ ...f, topic_quiz: v }))} />
        <Toggle label="Low-data mode" value={lowData} onChange={setLowData} />
      </article>

      {structure.learning_units.map((lu) => {
        const allIn = lu.subtopics.every((s) => selected.has(s.id));
        const anyIn = lu.subtopics.some((s) => selected.has(s.id));
        return (
          <article key={lu.id} className="card space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allIn}
                ref={(el) => {
                  if (el) el.indeterminate = !allIn && anyIn;
                }}
                onChange={() => toggleLU(lu.id)}
              />
              <span className="font-medium text-slate-900">
                {lu.ordinal}. {lu.topic}
              </span>
              <span className="text-xs text-slate-500">({lu.subtopics.length} subtopics)</span>
            </label>
            <ul className="ml-6 space-y-1">
              {lu.subtopics.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggleSub(s.id)} />
                    <span>
                      {s.ordinal}. {s.title}
                    </span>
                    <span className="text-xs text-slate-400">{s.word_count}w</span>
                  </label>
                </li>
              ))}
            </ul>
          </article>
        );
      })}

      <article className="card flex items-center justify-between">
        <p className="text-sm text-slate-600">
          {selected.size} subtopics · ~{Math.round(totalWords / 250)} min reading
        </p>
        <button className="btn-primary" disabled={loading || selected.size === 0} onClick={save}>
          {loading ? 'Saving…' : 'Continue'}
        </button>
      </article>
    </section>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-sm text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`h-6 w-11 rounded-full transition-colors ${value ? 'bg-brand-500' : 'bg-slate-300'}`}
      >
        <span className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}
