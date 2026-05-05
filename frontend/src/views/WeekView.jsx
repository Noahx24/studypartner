import { useMemo } from 'react';
import { Card, Chip, IconBtn, Screen, ScreenHeader } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
import { isoDate, startOfWeek } from '../utils/date';
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function WeekView({ modules, weekSessions, assessments }) {
    const start = startOfWeek(new Date());
    const todayKey = isoDate(new Date());
    const days = useMemo(() => {
        return Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const key = isoDate(d);
            const sessions = weekSessions.filter((s) => s.session_date === key);
            return {
                key,
                label: DAY_LABELS[i],
                date: d.getDate(),
                isToday: key === todayKey,
                sessions,
                totalMin: sessions.reduce((a, s) => a + s.planned_minutes, 0),
                deadlines: assessments.filter((a) => a.due_date === key),
            };
        });
    }, [start, todayKey, weekSessions, assessments]);
    const total = days.reduce((a, d) => a + d.sessions.length, 0);
    const totalMin = days.reduce((a, d) => a + d.totalMin, 0);
    const rangeLabel = `${start.toLocaleString('en-US', { day: 'numeric', month: 'short' })} – ${new Date(start.getTime() + 6 * 86400000).toLocaleString('en-US', { day: 'numeric', month: 'short' }).toUpperCase()}`;
    const maxMin = Math.max(60, ...days.map((d) => d.totalMin));
    return (<Screen>
      <ScreenHeader subtitle={rangeLabel} title="Week" right={<IconBtn aria-label="Replan">
            <Icon name="sparkles" size={18} color={P.primary}/>
          </IconBtn>}/>

      <div className="px-4">
        <Card pad={16} style={{ marginBottom: 14 }}>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[12px] font-bold uppercase tracking-wider text-ink3">Load</div>
              <div className="mono text-[22px] font-bold tracking-[-0.6px] text-ink" style={{ fontFamily: MONO }}>
                {total} sessions · {Math.round(totalMin / 60)}h
              </div>
            </div>
            <Chip tone="ok" leadingIcon="trend">
              Balanced
            </Chip>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
            const h = Math.min(48, Math.max(6, (d.totalMin / maxMin) * 48));
            return (<div key={d.key} className="flex flex-col items-center gap-1.5">
                  <div className="mono text-[10px] font-semibold text-ink3" style={{ fontFamily: MONO }}>
                    {d.label[0]}
                  </div>
                  <div className="flex h-12 w-full items-end">
                    <div className="w-full rounded" style={{
                    height: h,
                    background: d.isToday ? P.ink : d.totalMin === 0 ? P.line : P.primary,
                    opacity: d.totalMin === 0 ? 0.3 : 1,
                }}/>
                  </div>
                  <div className="mono text-[10px] font-medium" style={{
                    fontFamily: MONO,
                    fontWeight: d.isToday ? 700 : 500,
                    color: d.isToday ? P.ink : P.ink3,
                }}>
                    {d.date}
                  </div>
                </div>);
        })}
          </div>
        </Card>

        {days.map((d) => (<div key={d.key} className="mb-5">
            <div className="flex items-baseline gap-2 px-1 pb-2.5 pt-1">
              <div className="text-[18px] font-bold tracking-[-0.3px] text-ink">{d.label}</div>
              <div className="mono text-[13px] text-ink3" style={{ fontFamily: MONO }}>
                {d.date}
              </div>
              {d.isToday && <Chip tone="lime">Today</Chip>}
              {d.deadlines.length > 0 && <Chip tone="risk">{d.deadlines.length} due</Chip>}
              <div className="flex-1"/>
              <div className="mono text-[12px] text-ink3" style={{ fontFamily: MONO }}>
                {d.sessions.length > 0 ? `${d.totalMin}m` : '—'}
              </div>
            </div>

            {d.sessions.length === 0 ? (<Card pad={14}>
                <p className="text-[13px] text-ink3">Empty — rest or replan.</p>
              </Card>) : (<div className="flex flex-col gap-2">
                {d.sessions.map((s) => {
                    const mod = modules.find((m) => m.id === s.module_id);
                    return (<WeekSessionRow key={s.id} session={s} moduleName={mod?.name ?? s.module_id}/>);
                })}
              </div>)}
          </div>))}
      </div>
    </Screen>);
}
function WeekSessionRow({ session, moduleName, }) {
    const c = moduleColor(session.module_id);
    const done = session.status === 'completed';
    return (<div className="flex items-center gap-2.5 rounded-[14px] border border-line bg-surface px-3.5 py-3" style={{ opacity: done ? 0.55 : 1 }}>
      <div className="h-[30px] w-1 shrink-0 rounded" style={{ background: c.solid }}/>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="mono text-[11px] font-bold tracking-wider" style={{ color: c.fg, fontFamily: MONO }}>
            {session.module_id}
          </span>
        </div>
        <div className="mt-0.5 truncate text-[13px] font-medium text-ink">{moduleName}</div>
      </div>
      <div className="mono text-[12px] font-semibold text-ink2" style={{ fontFamily: MONO }}>
        {session.planned_minutes}m
      </div>
    </div>);
}
