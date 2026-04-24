import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { downloadAndStorePack } from '../hooks/usePack';
import { Card, Chip } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
import type { PackPayload, QuizPayload, SummaryPayload } from '../types';

type Props = {
  pack_id: string;
  payload: PackPayload;
  onClose: () => void;
};

export function PackReaderView({ pack_id, payload: initial, onClose }: Props) {
  const [payload, setPayload] = useState(initial);
  const [luIdx, setLuIdx] = useState(0);
  const [subIdx, setSubIdx] = useState(0);
  const [mode, setMode] = useState<'summary' | 'quiz' | 'topic'>('summary');
  const [regenNotice, setRegenNotice] = useState<string | null>(null);
  // Tracks the current in-flight regen so concurrent clicks don't pile polls.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const lu = payload.learning_units[luIdx];
  const sub = lu?.subtopics[subIdx];

  // Cancel any in-flight regen poll when the user leaves the reader so we
  // don't setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  const progressLabel = useMemo(() => {
    const total = payload.learning_units.reduce((a, x) => a + x.subtopics.length, 0);
    let idx = 0;
    for (let i = 0; i < luIdx; i++) idx += payload.learning_units[i].subtopics.length;
    return `${idx + subIdx + 1} / ${total}`;
  }, [payload, luIdx, subIdx]);

  if (!lu || !sub) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-ink3">Pack is empty.</p>
      </div>
    );
  }

  const c = moduleColor(payload.module_id);

  const next = () => {
    if (subIdx + 1 < lu.subtopics.length) {
      setSubIdx(subIdx + 1);
      setMode('summary');
    } else if (luIdx + 1 < payload.learning_units.length) {
      setLuIdx(luIdx + 1);
      setSubIdx(0);
      setMode('summary');
    }
  };

  const prev = () => {
    if (subIdx > 0) {
      setSubIdx(subIdx - 1);
      setMode('summary');
    } else if (luIdx > 0) {
      const prev = payload.learning_units[luIdx - 1];
      setLuIdx(luIdx - 1);
      setSubIdx(prev.subtopics.length - 1);
      setMode('summary');
    }
  };

  const regenerate = useCallback(
    async (scope: 'summary' | 'subtopic_quiz' | 'topic_quiz', ref_id: string) => {
      try {
        setRegenNotice('Regenerating…');
        await api.regeneratePack(pack_id, { scope, ref_id });

        if (pollRef.current) clearInterval(pollRef.current);
        const startedAt = Date.now();
        pollRef.current = setInterval(async () => {
          try {
            const status = await api.getPackStatus(pack_id);
            if (status.status === 'generated') {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              const fresh = await downloadAndStorePack(pack_id);
              setPayload(fresh);
              setRegenNotice(null);
            } else if (status.status === 'failed') {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              setRegenNotice('Regeneration failed. Please try again.');
            } else if (Date.now() - startedAt > 60_000) {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              setRegenNotice('Timed out. Open the pack again later.');
            }
          } catch (err) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
            setRegenNotice(err instanceof Error ? err.message : 'Refresh failed');
          }
        }, 1500);
      } catch (err) {
        setRegenNotice(err instanceof Error ? err.message : 'Regeneration failed');
      }
    },
    [pack_id],
  );

  return (
    <div className="min-h-full pb-32" style={{ background: P.bg }}>
      <div
        className="sticky top-0 z-10 flex items-center justify-between px-5 pb-3 pt-[54px]"
        style={{ background: P.bg }}
      >
        <button onClick={onClose} className="-m-2 p-2" aria-label="Close">
          <Icon name="close" size={22} color={P.ink} />
        </button>
        <div
          className="mono text-[12px] font-semibold text-ink3"
          style={{ fontFamily: MONO }}
        >
          {progressLabel}
        </div>
        <div className="w-6" />
      </div>

      <div className="px-4">
        <div
          className="mono mb-1 text-[11px] font-bold tracking-wider"
          style={{ color: c.fg, fontFamily: MONO }}
        >
          {payload.module_id}
        </div>
        <h1 className="text-[22px] font-bold leading-tight tracking-[-0.5px] text-ink">
          {lu.ordinal}. {lu.topic}
        </h1>
        <div className="mt-1 text-[14px] text-ink2">
          {sub.ordinal}. {sub.title}
        </div>

        {regenNotice && (
          <div
            className="mt-3 flex items-center gap-2 rounded-[12px] px-3 py-2 text-[12px]"
            style={{ background: P.primarySoft, color: P.primary }}
          >
            <Icon name="refresh" size={13} color={P.primary} />
            {regenNotice}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <ModeBtn
            label="Summary"
            on={mode === 'summary'}
            disabled={!sub.summary}
            onClick={() => setMode('summary')}
          />
          <ModeBtn
            label="Quiz"
            on={mode === 'quiz'}
            disabled={!sub.quiz}
            onClick={() => setMode('quiz')}
          />
          <ModeBtn
            label="Unit quiz"
            on={mode === 'topic'}
            disabled={!lu.topic_quiz}
            onClick={() => setMode('topic')}
          />
        </div>

        <div className="mt-4">
          {mode === 'summary' && sub.summary && (
            <SummaryCard
              key={`summary:${sub.id}`}
              summary={sub.summary}
              onRegenerate={() => regenerate('summary', sub.id)}
            />
          )}
          {mode === 'quiz' && sub.quiz && (
            <QuizRunner
              key={`subtopic-quiz:${sub.id}`}
              quiz={sub.quiz}
              onRegenerate={() => regenerate('subtopic_quiz', sub.id)}
            />
          )}
          {mode === 'topic' && lu.topic_quiz && (
            <QuizRunner
              key={`topic-quiz:${lu.id}`}
              quiz={lu.topic_quiz}
              onRegenerate={() => regenerate('topic_quiz', lu.id)}
            />
          )}
        </div>
      </div>

      <div
        className="fixed bottom-0 left-1/2 z-20 flex w-full max-w-[440px] -translate-x-1/2 gap-3 px-4 pb-7 pt-3"
        style={{ background: `linear-gradient(to top, ${P.bg} 60%, ${P.bg}00)` }}
      >
        <button
          onClick={prev}
          disabled={luIdx === 0 && subIdx === 0}
          className="btn-secondary flex-1"
        >
          <Icon name="arrowLeft" size={14} /> Back
        </button>
        <button onClick={next} className="btn-primary flex-1">
          Next <Icon name="arrowRight" size={14} color="#fff" />
        </button>
      </div>
    </div>
  );
}

function ModeBtn({
  label,
  on,
  onClick,
  disabled,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-40"
      style={{
        background: on ? P.ink : 'transparent',
        color: on ? P.surface : P.ink2,
        border: `1px solid ${on ? P.ink : P.line}`,
      }}
    >
      {label}
    </button>
  );
}

function SummaryCard({
  summary,
  onRegenerate,
}: {
  summary: SummaryPayload;
  onRegenerate: () => void;
}) {
  return (
    <Card>
      {summary.key_concepts && summary.key_concepts.length > 0 && (
        <>
          <Label>Key concepts</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {summary.key_concepts.map((k) => (
              <Chip key={k} tone="primary">
                {k}
              </Chip>
            ))}
          </div>
        </>
      )}
      {summary.bullets && summary.bullets.length > 0 && (
        <>
          <Label style={{ marginTop: 18 }}>Summary</Label>
          <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-ink">
            {summary.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </>
      )}
      {summary.simple_explanation && (
        <>
          <Label style={{ marginTop: 18 }}>Plain language</Label>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink2">
            {summary.simple_explanation}
          </p>
        </>
      )}
      {summary.raw && (
        <pre className="mono mt-3 whitespace-pre-wrap text-[12px] text-ink3">
          {summary.raw}
        </pre>
      )}
      <button onClick={onRegenerate} className="btn-secondary mt-4 w-full">
        <Icon name="refresh" size={13} /> Rewrite summary
      </button>
    </Card>
  );
}

function QuizRunner({
  quiz,
  onRegenerate,
}: {
  quiz: QuizPayload;
  onRegenerate: () => void;
}) {
  const [answers, setAnswers] = useState<Record<number, string | number>>({});
  const [submitted, setSubmitted] = useState(false);
  const questions = quiz.questions ?? [];

  const score = submitted
    ? questions.reduce((acc, q, i) => {
        if (q.type === 'mcq' && answers[i] === q.answer) return acc + 1;
        return acc;
      }, 0)
    : 0;

  return (
    <Card>
      {questions.length === 0 && <p className="text-sm text-ink3">No questions.</p>}
      <div className="flex flex-col gap-4">
        {questions.map((q, i) => (
          <div key={i}>
            <div className="mb-2 flex items-center gap-2">
              <span
                className="mono text-[11px] font-bold text-ink3"
                style={{ fontFamily: MONO }}
              >
                Q{i + 1}
              </span>
              <span className="text-[14px] font-medium text-ink">{q.q}</span>
            </div>
            {q.type === 'mcq' ? (
              <div className="flex flex-col gap-1.5">
                {q.choices.map((ch, ci) => {
                  const chosen = answers[i] === ci;
                  const correct = submitted && ci === q.answer;
                  const wrong = submitted && chosen && ci !== q.answer;
                  return (
                    <button
                      key={ci}
                      disabled={submitted}
                      onClick={() => setAnswers((a) => ({ ...a, [i]: ci }))}
                      className="rounded-[12px] px-3.5 py-2.5 text-left text-[13px] transition-colors"
                      style={{
                        border: `1.5px solid ${
                          correct
                            ? P.mintDeep
                            : wrong
                            ? P.coralDeep
                            : chosen
                            ? P.ink
                            : P.line
                        }`,
                        background: correct
                          ? P.mintSoft
                          : wrong
                          ? P.coralSoft
                          : chosen
                          ? P.surface
                          : 'transparent',
                        color: correct
                          ? P.mintDeep
                          : wrong
                          ? P.coralDeep
                          : P.ink,
                      }}
                    >
                      {ch}
                    </button>
                  );
                })}
                {submitted && q.explain && (
                  <p className="mt-1 text-[12px] text-ink3">{q.explain}</p>
                )}
              </div>
            ) : (
              <>
                <input
                  className="input"
                  disabled={submitted}
                  value={(answers[i] as string) ?? ''}
                  onChange={(e) =>
                    setAnswers((a) => ({ ...a, [i]: e.target.value }))
                  }
                  placeholder="Your answer"
                />
                {submitted && (
                  <p className="mt-1 text-[12px] text-ink2">Answer: {q.answer}</p>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => setSubmitted(true)}
          disabled={submitted || questions.length === 0}
          className="btn-primary flex-1"
        >
          {submitted
            ? `Score ${score}/${questions.filter((q) => q.type === 'mcq').length}`
            : 'Check answers'}
        </button>
        <button onClick={onRegenerate} className="btn-secondary">
          <Icon name="refresh" size={13} /> Rewrite
        </button>
      </div>
    </Card>
  );
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase tracking-wider text-ink3"
      style={style}
    >
      {children}
    </div>
  );
}
