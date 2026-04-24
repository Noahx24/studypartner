import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import { Card, IconBtn, ProgressRing, Screen, ScreenHeader } from '../ui/primitives';
import { P, MONO, moduleColor } from '../ui/tokens';
import type { ModuleForm, StudySession, UserSettings } from '../types';

type Props = {
  user: UserSettings;
  modules: ModuleForm[];
  sessions: StudySession[];
  onStartSession: (s: StudySession) => void;
  onCompleteSession: (s: StudySession) => Promise<void>;
  onReschedule: () => Promise<void>;
};

export function TodayView({ modules, sessions, onStartSession, onCompleteSession, onReschedule }: Props) {
  const [replanning, setReplanning] = useState(false);

  const { totalMin, doneMin, done, total } = useMemo(() => {
    const total = sessions.length;
    const done = sessions.filter((s) => s.status === 'completed').length;
    const totalMin = sessions.reduce((a, s) => a + s.planned_minutes, 0);
    const doneMin = sessions.filter((s) => s.status === 'completed').reduce((a, s) => a + s.planned_minutes, 0);
    return { total, done, totalMin, doneMin };
  }, [sessions]);

  const nextId = sessions.find((s) => s.status === 'planned')?.id;
  const today = new Date();
  const dateLabel = today
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();

  const handleReplan = async () => {
    setReplanning(true);
    try {
      await onReschedule();
    } finally {
      setReplanning(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        subtitle={dateLabel}
        title="Today"
        right={
          <IconBtn onClick={handleReplan} aria-label="Replan">
            <Icon name={replanning ? 'sparkles' : 'refresh'} size={18} />
          </IconBtn>
        }
      />

      <div className="px-4">
        {total > 0 && (
          <Card pad={16} style={{ marginBottom: 14 }}>
            <div className="flex items-center gap-3.5">
              <ProgressRing value={doneMin / (totalMin || 1)} size={60} stroke={6} color={P.primary} />
              <div className="flex-1">
                <div
                  className="mono text-[22px] font-bold tracking-[-0.5px] text-ink"
                  style={{ fontFamily: MONO }}
                >
                  {done}
                  <span className="text-ink3"> / {total}</span>
                </div>
                <div className="mt-0.5 text-[13px] text-ink2">
                  {doneMin}m done · {totalMin - doneMin}m left
                </div>
              </div>
              <button onClick={handleReplan} className="btn-secondary text-[12px]">
                <Icon name="sparkles" size={13} /> Replan
              </button>
            </div>
          </Card>
        )}

        {total === 0 ? (
          <Card>
            <p className="text-[14px] text-ink2">
              No sessions scheduled for today. Upload material or wait for tomorrow's plan.
            </p>
          </Card>
        ) : (
          <div className="relative pl-8">
            <div
              className="absolute"
              style={{ left: 22, top: 14, bottom: 14, width: 1.5, background: P.line }}
            />
            {sessions.map((s, i) => (
              <TimelineItem
                key={s.id}
                session={s}
                indexLabel={String(i + 1).padStart(2, '0')}
                isCurrent={s.id === nextId}
                moduleName={modules.find((m) => m.id === s.module_id)?.name ?? s.module_id}
                onStart={() => onStartSession(s)}
                onToggle={() => onCompleteSession(s)}
              />
            ))}
          </div>
        )}
      </div>
    </Screen>
  );
}

function TimelineItem({
  session,
  indexLabel,
  isCurrent,
  moduleName,
  onStart,
  onToggle,
}: {
  session: StudySession;
  indexLabel: string;
  isCurrent: boolean;
  moduleName: string;
  onStart: () => void;
  onToggle: () => void;
}) {
  const c = moduleColor(session.module_id);
  const isDone = session.status === 'completed';

  return (
    <div className="relative mb-3">
      <div
        className="mono absolute text-[11px] font-semibold text-ink3"
        style={{ left: -30, top: 16, width: 24, textAlign: 'right', fontFamily: MONO }}
      >
        {indexLabel}
      </div>
      <div
        className="absolute z-10 h-3.5 w-3.5 rounded-full"
        style={{
          left: -14,
          top: 18,
          background: isCurrent ? P.lime : isDone ? c.solid : P.surface,
          border: `2px solid ${isCurrent ? P.ink : isDone ? c.solid : P.line}`,
        }}
      >
        {isCurrent && (
          <div
            className="sp-pulse absolute rounded-full"
            style={{ inset: -6, border: `2px solid ${P.lime}`, opacity: 0.4 }}
          />
        )}
      </div>
      <Card
        pad={14}
        variant={isCurrent ? 'dark' : 'surface'}
        style={isCurrent ? { background: P.ink, color: P.surface } : undefined}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onToggle}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{
              border: `1.5px solid ${isDone ? c.solid : isCurrent ? P.lime : P.ink3}`,
              background: isDone ? c.solid : 'transparent',
            }}
          >
            {isDone && <Icon name="check" size={16} color="#fff" strokeWidth={2.8} />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="mono text-[11px] font-bold tracking-wider"
                style={{ color: isCurrent ? c.solid : c.fg, fontFamily: MONO }}
              >
                {session.module_id}
              </span>
              <span
                className="mono text-[11px]"
                style={{
                  color: isCurrent ? 'rgba(255,255,255,0.5)' : P.ink3,
                  fontFamily: MONO,
                }}
              >
                {session.planned_minutes}m
              </span>
            </div>
            <div
              className="mt-1 text-[15px] font-semibold"
              style={{
                textDecoration: isDone ? 'line-through' : 'none',
                opacity: isDone ? 0.55 : 1,
              }}
            >
              {moduleName}
            </div>
          </div>
          {isCurrent && !isDone && (
            <button onClick={onStart} className="btn-lime text-[13px]" style={{ padding: '9px 14px' }}>
              <Icon name="play" size={12} color={P.limeInk} /> Start
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}
