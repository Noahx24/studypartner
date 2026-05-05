import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { Card, Chip, Screen, ScreenHeader, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
export function SelectionView({ userId, moduleId, onBack, onSelectionSaved }) {
    const [structure, setStructure] = useState(null);
    const [selected, setSelected] = useState(new Set());
    const [expanded, setExpanded] = useState(new Set());
    const [features, setFeatures] = useState({
        summaries: true,
        subtopic_quiz: true,
        topic_quiz: true,
    });
    const [lowData, setLowData] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    useEffect(() => {
        let cancelled = false;
        api
            .getModuleStructure(moduleId)
            .then((s) => {
            if (cancelled)
                return;
            setStructure(s);
            setSelected(new Set(s.learning_units.flatMap((lu) => lu.subtopics.map((x) => x.id))));
        })
            .catch((err) => !cancelled &&
            setError(err instanceof Error ? err.message : 'Failed to load module structure'));
        return () => {
            cancelled = true;
        };
    }, [moduleId]);
    const totalWords = useMemo(() => {
        if (!structure)
            return 0;
        return structure.learning_units
            .flatMap((lu) => lu.subtopics)
            .filter((s) => selected.has(s.id))
            .reduce((acc, s) => acc + s.word_count, 0);
    }, [structure, selected]);
    const readingMin = Math.max(5, Math.round(totalWords / 250));
    const c = moduleColor(moduleId);
    const toggleSub = (id) => setSelected((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
    });
    const toggleLU = (luId) => {
        if (!structure)
            return;
        const lu = structure.learning_units.find((x) => x.id === luId);
        if (!lu)
            return;
        const allIn = lu.subtopics.every((s) => selected.has(s.id));
        setSelected((prev) => {
            const next = new Set(prev);
            for (const s of lu.subtopics)
                (allIn ? next.delete(s.id) : next.add(s.id));
            return next;
        });
    };
    const toggleExpand = (luId) => setExpanded((prev) => {
        const next = new Set(prev);
        next.has(luId) ? next.delete(luId) : next.add(luId);
        return next;
    });
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
        }
        catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to save selection');
        }
        finally {
            setLoading(false);
        }
    };
    return (<Screen>
      <ScreenHeader subtitle="PLAN A STUDY PACK" title="What to study" right={<button onClick={onBack} className="text-[13px] font-semibold text-ink2">
            Cancel
          </button>}/>

      <div className="px-4 pb-32">
        {error && (<div className="mb-3 rounded-[12px] px-3 py-2 text-sm" style={{ background: P.coralSoft, color: P.coralDeep }}>
            {error}
          </div>)}

        {!structure ? (<Card>
            <p className="text-sm text-ink3">Loading module structure…</p>
          </Card>) : (<>
            <SectionLabel title="Learning units"/>
            <div className="flex flex-col gap-2.5">
              {structure.learning_units.map((lu) => {
                const allIn = lu.subtopics.every((s) => selected.has(s.id));
                const someIn = lu.subtopics.some((s) => selected.has(s.id));
                const isOpen = expanded.has(lu.id);
                return (<Card key={lu.id} pad={0}>
                    <div className="p-[14px]">
                      <div className="flex items-center gap-3">
                        <button onClick={() => toggleLU(lu.id)} className="flex h-6 w-6 items-center justify-center rounded-md" style={{
                        background: allIn ? P.ink : 'transparent',
                        border: `1.5px solid ${allIn || someIn ? P.ink : P.ink3}`,
                    }} aria-label="Toggle all subtopics">
                          {allIn ? (<Icon name="check" size={14} color="#fff" strokeWidth={2.6}/>) : someIn ? (<div className="h-[2px] w-3" style={{ background: P.ink }}/>) : null}
                        </button>
                        <div className="min-w-0 flex-1" onClick={() => toggleExpand(lu.id)}>
                          <div className="flex items-center gap-2">
                            <span className="mono text-[11px] text-ink3" style={{ fontFamily: MONO }}>
                              {String(lu.ordinal).padStart(2, '0')}
                            </span>
                            <span className="text-[15px] font-semibold text-ink">
                              {lu.topic}
                            </span>
                          </div>
                          <div className="mono mt-0.5 text-[11px] text-ink3" style={{ fontFamily: MONO }}>
                            {lu.subtopics.length} subtopics
                          </div>
                        </div>
                        <button onClick={() => toggleExpand(lu.id)} className="flex h-8 w-8 items-center justify-center" aria-label={isOpen ? 'Collapse' : 'Expand'}>
                          <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={18} color={P.ink3}/>
                        </button>
                      </div>
                      {isOpen && (<ul className="ml-9 mt-3 space-y-1.5">
                          {lu.subtopics.map((s) => (<li key={s.id}>
                              <button onClick={() => toggleSub(s.id)} className="flex w-full items-center gap-2.5 text-left">
                                <span className="flex h-5 w-5 items-center justify-center rounded" style={{
                                background: selected.has(s.id) ? P.ink : 'transparent',
                                border: `1.5px solid ${selected.has(s.id) ? P.ink : P.ink3}`,
                            }}>
                                  {selected.has(s.id) && (<Icon name="check" size={11} color="#fff" strokeWidth={2.6}/>)}
                                </span>
                                <span className="text-[13px] text-ink">{s.title}</span>
                                <span className="mono ml-auto text-[11px] text-ink3" style={{ fontFamily: MONO }}>
                                  {s.word_count}w
                                </span>
                              </button>
                            </li>))}
                        </ul>)}
                    </div>
                  </Card>);
            })}
            </div>

            <SectionLabel title="AI features"/>
            <Card>
              <Toggle label="Summaries" sub="Key concepts, bullets, simple explanation" value={features.summaries} onChange={(v) => setFeatures((f) => ({ ...f, summaries: v }))}/>
              <Toggle label="Subtopic quizzes" sub="3–5 questions per subtopic" value={features.subtopic_quiz} onChange={(v) => setFeatures((f) => ({ ...f, subtopic_quiz: v }))}/>
              <Toggle label="Topic-level quiz" sub="Revision quiz at the end of each unit" value={features.topic_quiz} onChange={(v) => setFeatures((f) => ({ ...f, topic_quiz: v }))}/>
              <Toggle last label="Low-data mode" sub="Shorter outputs, text only" value={lowData} onChange={setLowData}/>
            </Card>
          </>)}
      </div>

      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-[440px] -translate-x-1/2 px-4 pb-7 pt-3" style={{ background: `linear-gradient(to top, ${P.bg} 60%, ${P.bg}00)` }}>
        <Card variant="dark" pad={12}>
          <div className="flex items-center gap-3">
            <div>
              <div className="mono text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.6)', fontFamily: MONO }}>
                Selected
              </div>
              <div className="mono text-[18px] font-bold text-white" style={{ fontFamily: MONO, letterSpacing: '-0.5px' }}>
                {selected.size}
              </div>
            </div>
            <Chip tone="lime">{`~${readingMin} min`}</Chip>
            <Chip tone="primary" style={{ background: c.bg, color: c.fg }}>
              {moduleId}
            </Chip>
            <div className="flex-1"/>
            <button onClick={save} disabled={loading || selected.size === 0} className="btn-lime" style={{ padding: '10px 16px' }}>
              {loading ? 'Saving…' : 'Continue'}
              <Icon name="arrowRight" size={16} color={P.limeInk}/>
            </button>
          </div>
        </Card>
      </div>
    </Screen>);
}
function Toggle({ label, sub, value, onChange, last, }) {
    return (<div className="flex items-center gap-3 py-2.5" style={{ borderBottom: last ? 'none' : `1px solid ${P.line}` }}>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-ink">{label}</div>
        {sub && <div className="mt-0.5 text-[12px] text-ink3">{sub}</div>}
      </div>
      <button onClick={() => onChange(!value)} className="relative h-6 w-11 rounded-full transition-colors" style={{ background: value ? P.ink : P.line }} aria-pressed={value}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform" style={{ left: value ? 22 : 2 }}/>
      </button>
    </div>);
}
