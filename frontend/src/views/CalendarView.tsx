import { useMemo } from 'react';
import { Card, Chip, Dot, IconBtn, Screen, ScreenHeader, SectionLabel } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
import { isoDate } from '../utils/date';
import type { AssessmentForm, ModuleForm, StudySession } from '../types';

type Props = {
  modules: ModuleForm[];
  weekSessions: StudySession[];
  assessments: AssessmentForm[];
  onOpenAssessments: () => void;
};

export function CalendarView({ modules, weekSessions, assessments, onOpenAssessments }: Props) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayKey = isoDate(today);

  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = Mon
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const loadByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of weekSessions) map[s.session_date] = (map[s.session_date] ?? 0) + 1;
    return map;
  }, [weekSessions]);

  const assessByDay = useMemo(() => {
    const map: Record<string, AssessmentForm> = {};
    for (const a of assessments) map[a.due_date] = a;
    return map;
  }, [assessments]);

  const monthLabel = today
    .toLocaleString('en-US', { month: 'long', year: 'numeric' })
    .toUpperCase();

  const upcoming = useMemo(
    () => [...assessments].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3),
    [assessments],
  );

  return (
    <Screen>
      <ScreenHeader
        subtitle={monthLabel}
        title="Calendar"
        right={
          <IconBtn aria-label="Filter">
            <Icon name="filter" size={18} />
          </IconBtn>
        }
      />

      <div className="px-4">
        <div className="grid grid-cols-7 gap-1 px-1 pb-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div
              key={i}
              className="mono text-center text-[11px] font-bold text-ink3"
              style={{ fontFamily: MONO }}
            >
              {d}
            </div>
          ))}
        </div>

        <Card pad={8}>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} className="aspect-square" />;
              const key = isoDate(d);
              const load = loadByDay[key] ?? 0;
              const assess = assessByDay[key];
              const c = assess ? moduleColor(assess.module_id) : null;
              const isToday = key === todayKey;
              return (
                <div
                  key={i}
                  className="relative flex aspect-square flex-col rounded-[10px] p-1.5"
                  style={{
                    background: isToday ? P.ink : 'transparent',
                    color: isToday ? P.surface : P.ink,
                  }}
                >
                  <div
                    className="mono text-[13px]"
                    style={{
                      fontFamily: MONO,
                      fontWeight: isToday ? 700 : 500,
                    }}
                  >
                    {d.getDate()}
                  </div>
                  <div className="mt-auto flex items-end gap-0.5">
                    {Array.from({ length: Math.min(load, 4) }).map((_, j) => (
                      <div
                        key={j}
                        className="h-[3px] flex-1 rounded"
                        style={{
                          background: isToday ? P.lime : P.primary,
                          opacity: isToday ? 1 : 0.4 + j * 0.15,
                        }}
                      />
                    ))}
                  </div>
                  {c && (
                    <div
                      className="absolute right-1 top-1 h-2 w-2 rounded-full"
                      style={{
                        background: c.solid,
                        border: `1.5px solid ${isToday ? P.ink : P.surface}`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <SectionLabel title="Upcoming deadlines" action="All" onAction={onOpenAssessments} />
        {upcoming.length === 0 ? (
          <Card>
            <p className="text-sm text-ink2">No deadlines this month.</p>
          </Card>
        ) : (
          <div className="flex flex-col gap-2.5">
            {upcoming.map((a) => {
              const m = modules.find((x) => x.id === a.module_id);
              const c = moduleColor(a.module_id);
              const due = new Date(a.due_date);
              const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
              return (
                <Card key={a.id} pad={14}>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-[50px] w-12 shrink-0 flex-col items-center justify-center rounded-[10px]"
                      style={{ background: c.bg, color: c.fg }}
                    >
                      <div
                        className="mono text-[10px] font-bold opacity-70"
                        style={{ fontFamily: MONO }}
                      >
                        {due.toLocaleString('en-US', { month: 'short' }).toUpperCase()}
                      </div>
                      <div
                        className="mono text-[20px] font-extrabold leading-none"
                        style={{ fontFamily: MONO }}
                      >
                        {due.getDate()}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="mono text-[11px] font-bold tracking-wider"
                        style={{ color: c.fg, fontFamily: MONO }}
                      >
                        {a.module_id}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-ink">{a.title}</div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Chip tone={days <= 14 ? 'risk' : 'primary'} leadingIcon="clock">
                          {days}d left
                        </Chip>
                        <span
                          className="mono text-xs text-ink3"
                          style={{ fontFamily: MONO }}
                        >
                          {m?.name ?? a.module_id}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <SectionLabel title="Legend" />
        <Card pad={14}>
          <div className="flex flex-wrap gap-3">
            {modules.map((m) => {
              const c = moduleColor(m.id);
              return (
                <div
                  key={m.id}
                  className="mono flex items-center gap-2 text-xs text-ink2"
                  style={{ fontFamily: MONO }}
                >
                  <Dot color={c.solid} /> {m.id}
                </div>
              );
            })}
            {modules.length === 0 && <p className="text-sm text-ink3">No modules.</p>}
          </div>
        </Card>
      </div>
    </Screen>
  );
}
