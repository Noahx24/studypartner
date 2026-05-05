import { useMemo } from 'react';
import { Card, Chip, IconBtn, Screen, ScreenHeader, StatCell } from '../ui/primitives';
import { Icon } from '../ui/Icon';
import { P, MONO, moduleColor } from '../ui/tokens';
export function ModulesView({ modules, weekSessions, assessments, onOpenModule, onUpload }) {
    const stats = useMemo(() => modules.map((m) => {
        const mSessions = weekSessions.filter((s) => s.module_id === m.id);
        const completed = mSessions.filter((s) => s.status === 'completed').length;
        const total = mSessions.length || 0;
        const weekMinutes = mSessions.reduce((a, s) => a + s.planned_minutes, 0);
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        const next = assessments
            .filter((a) => a.module_id === m.id)
            .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
        const daysLeft = next
            ? Math.ceil((new Date(next.due_date).getTime() - Date.now()) / 86400000)
            : null;
        const status = daysLeft !== null && daysLeft <= 7 && progress < 60
            ? 'risk'
            : daysLeft !== null && daysLeft <= 14 && progress < 50
                ? 'warn'
                : 'ok';
        return { ...m, completed, total, weekMinutes, progress, next, status };
    }), [modules, weekSessions, assessments]);
    return (<Screen>
      <ScreenHeader subtitle="ALL MODULES" title="Modules" right={<IconBtn onClick={onUpload} aria-label="Upload">
            <Icon name="plus" size={18}/>
          </IconBtn>}/>

      <div className="px-4">
        {stats.length === 0 ? (<Card>
            <p className="text-sm text-ink2">
              No modules yet. Upload study material or connect Moodle to get started.
            </p>
            <button onClick={onUpload} className="btn-primary mt-4 w-full">
              <Icon name="plus" size={16} color="#fff"/> Add material
            </button>
          </Card>) : (<div className="flex flex-col gap-3">
            {stats.map((m) => {
                const c = moduleColor(m.id);
                const statusLabel = m.status === 'risk' ? 'Critical' : m.status === 'warn' ? 'Behind' : 'On track';
                return (<Card key={m.id} onClick={() => onOpenModule(m.id)} pad={0}>
                  <div className="p-[18px]">
                    <div className="mb-3.5 flex items-center gap-3">
                      <div className="mono flex h-11 w-11 items-center justify-center rounded-[12px] text-[11px] font-bold" style={{ background: c.bg, color: c.fg, fontFamily: MONO }}>
                        {m.id.slice(0, 3).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mono text-[11px] font-bold tracking-wider" style={{ color: c.fg, fontFamily: MONO }}>
                          {m.id}
                        </div>
                        <div className="mt-0.5 text-[15px] font-semibold text-ink">{m.name}</div>
                      </div>
                      <Chip tone={m.status}>{statusLabel}</Chip>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <StatCell label="This week" value={`${Math.round(m.weekMinutes / 60)}h`}/>
                      <StatCell label="Sessions" value={`${m.completed}/${m.total}`}/>
                      <StatCell label="Type" value={m.module_type === 'year' ? 'Year' : 'Term'}/>
                    </div>

                    <div className="mt-3.5 h-2 overflow-hidden rounded" style={{ background: P.line }}>
                      <div className="h-full rounded" style={{ width: `${m.progress}%`, background: c.solid }}/>
                    </div>
                    <div className="mono mt-1.5 flex justify-between text-[11px] text-ink3" style={{ fontFamily: MONO }}>
                      <span>{m.progress}% through week</span>
                      <span>
                        {m.next ? `Next: ${m.next.title}` : 'No deadlines'}
                      </span>
                    </div>
                  </div>
                </Card>);
            })}
          </div>)}
      </div>
    </Screen>);
}
