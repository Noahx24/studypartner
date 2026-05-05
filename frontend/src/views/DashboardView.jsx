import { useMemo } from 'react';
import { Icon } from '../ui/Icon';
import { Card, Chip, IconBtn, ProgressRing, Screen, ScreenHeader, SectionLabel, SyncPill, } from '../ui/primitives';
import { P, MONO, moduleColor } from '../ui/tokens';
export function DashboardView({ user, modules, assessments, todaySessions, weekSessions, syncState, onSync, onStartSession, onOpenModules, onOpenAssessments, onOpenModule, onOpenSettings, }) {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
    const doneMin = todaySessions.filter((s) => s.status === 'completed').reduce((a, s) => a + s.planned_minutes, 0);
    const totalMin = todaySessions.reduce((a, s) => a + s.planned_minutes, 0);
    const remainingMin = Math.max(0, totalMin - doneMin);
    const nextSession = todaySessions.find((s) => s.status === 'planned') ?? null;
    const doneCount = todaySessions.filter((s) => s.status === 'completed').length;
    const moduleStats = useMemo(() => {
        return modules.map((m) => {
            const moduleSessions = weekSessions.filter((s) => s.module_id === m.id);
            const completed = moduleSessions.filter((s) => s.status === 'completed').length;
            const total = moduleSessions.length || 1;
            const progress = Math.round((completed / total) * 100);
            const nextDeadline = assessments
                .filter((a) => a.module_id === m.id)
                .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date;
            const daysLeft = nextDeadline
                ? Math.ceil((new Date(nextDeadline).getTime() - Date.now()) / 86400000)
                : null;
            const status = daysLeft !== null && daysLeft <= 7 && progress < 60
                ? 'risk'
                : daysLeft !== null && daysLeft <= 14 && progress < 50
                    ? 'warn'
                    : 'ok';
            return { ...m, progress, completed, total, status };
        });
    }, [modules, weekSessions, assessments]);
    const upcoming = useMemo(() => [...assessments].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 2), [assessments]);
    return (<Screen>
      <ScreenHeader subtitle={`${greet.toUpperCase()}, ${user.name.toUpperCase()}`} title={remainingMin > 0
            ? `${(remainingMin / 60).toFixed(1)}h of study left today.`
            : "You're clear for today ✓"} right={<div className="flex items-center gap-2">
            <SyncPill state={syncState} onClick={onSync}/>
            <IconBtn size={36} aria-label="Settings" onClick={onOpenSettings}>
              <Icon name="settings" size={18} color={P.ink}/>
            </IconBtn>
          </div>}/>

      <div className="px-4">
        {nextSession ? (<NextSessionCard session={nextSession} moduleName={modules.find((m) => m.id === nextSession.module_id)?.name ?? nextSession.module_id} onStart={() => onStartSession(nextSession)}/>) : (<Card variant="dark">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 w-2 rounded-full" style={{ background: P.lime }}/>
              <span className="mono text-[11px] font-bold uppercase tracking-wider opacity-70" style={{ fontFamily: MONO }}>
                No more sessions today
              </span>
            </div>
            <div className="text-[20px] font-semibold">Rest day. See you tomorrow.</div>
          </Card>)}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Card pad={16}>
            <div className="flex items-center gap-3">
              <ProgressRing value={doneMin / (totalMin || 1)} size={56} stroke={5} color={P.primary}/>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-ink3">Today</div>
                <div className="mono text-[22px] font-bold text-ink" style={{ fontFamily: MONO, letterSpacing: '-1px' }}>
                  {doneCount}
                  <span className="text-ink3">/{todaySessions.length}</span>
                </div>
              </div>
            </div>
          </Card>
          <Card pad={16} variant="tinted" style={{ background: P.lime }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: P.limeInk }}>
                <Icon name="fire" size={20} color={P.lime}/>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70" style={{ color: P.limeInk }}>
                  Done today
                </div>
                <div className="mono text-[22px] font-bold" style={{ color: P.limeInk, fontFamily: MONO, letterSpacing: '-1px' }}>
                  {doneMin}
                  <span className="ml-1 text-sm font-medium">min</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <SectionLabel title="This week" action="See all" onAction={onOpenModules}/>
        <div className="flex flex-col gap-2.5">
          {moduleStats.length === 0 ? (<Card>
              <p className="text-sm text-ink2">Add modules to start planning.</p>
            </Card>) : (moduleStats.slice(0, 3).map((m) => (<ModuleProgressRow key={m.id} module={m} onClick={() => onOpenModule(m.id)}/>)))}
        </div>

        <SectionLabel title="Coming up" action="All" onAction={onOpenAssessments}/>
        <div className="flex flex-col gap-2.5">
          {upcoming.length === 0 ? (<Card>
              <p className="text-sm text-ink2">No deadlines yet.</p>
            </Card>) : (upcoming.map((a) => {
            const m = modules.find((x) => x.id === a.module_id);
            return <AssessmentRow key={a.id} a={a} moduleName={m?.name ?? a.module_id}/>;
        }))}
        </div>
      </div>
    </Screen>);
}
function NextSessionCard({ session, moduleName, onStart, }) {
    const c = moduleColor(session.module_id);
    return (<Card variant="dark" pad={0}>
      <div className="relative p-5">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full" style={{ background: P.lime }}/>
          <span className="mono text-[11px] font-bold uppercase tracking-wider opacity-70" style={{ fontFamily: MONO }}>
            Now · {session.planned_minutes}m
          </span>
        </div>
        <div className="mono mb-1 text-[13px] font-bold tracking-wider" style={{ color: c.solid, fontFamily: MONO }}>
          {session.module_id}
        </div>
        <div className="text-[22px] font-bold leading-tight tracking-[-0.6px]">
          {moduleName}
        </div>
        <div className="mono mt-2 text-[13px] opacity-65" style={{ fontFamily: MONO }}>
          {session.planned_minutes} min focus
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={onStart} className="btn-lime flex-1">
            <Icon name="play" size={16} color={P.limeInk}/> Start focus
          </button>
          <IconBtn tone="dark" size={48} aria-label="Skip">
            <Icon name="chevronRight" size={20} color={P.surface}/>
          </IconBtn>
        </div>
      </div>
    </Card>);
}
function ModuleProgressRow({ module, onClick, }) {
    const c = moduleColor(module.id);
    const statusLabel = module.status === 'risk' ? 'Critical' : module.status === 'warn' ? 'Behind' : 'On track';
    return (<Card pad={14} onClick={onClick}>
      <div className="flex items-center gap-3">
        <div className="mono flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-[10px] font-bold" style={{ background: c.bg, color: c.fg, fontFamily: MONO }}>
          {module.id.slice(0, 3).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-semibold text-ink">{module.name}</div>
            <Chip tone={module.status}>{statusLabel}</Chip>
          </div>
          <div className="mt-2.5 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: P.line }}>
              <div className="h-full rounded-full" style={{ width: `${module.progress}%`, background: c.solid }}/>
            </div>
            <div className="mono min-w-[48px] text-right text-[11px] text-ink3" style={{ fontFamily: MONO }}>
              {module.completed}/{module.total}
            </div>
          </div>
        </div>
      </div>
    </Card>);
}
function AssessmentRow({ a, moduleName }) {
    const c = moduleColor(a.module_id);
    const dueDate = new Date(a.due_date);
    const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);
    const urgent = daysLeft <= 14;
    const month = dueDate.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = dueDate.getDate();
    return (<Card pad={14}>
      <div className="flex items-center gap-3">
        <div className="flex h-[54px] w-12 shrink-0 flex-col items-center justify-center rounded-[10px]" style={{ background: c.bg, color: c.fg }}>
          <div className="mono text-[10px] font-bold opacity-70" style={{ fontFamily: MONO }}>
            {month}
          </div>
          <div className="mono text-[20px] font-extrabold leading-none" style={{ fontFamily: MONO }}>
            {day}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mono text-[11px] font-bold tracking-wider" style={{ color: c.fg, fontFamily: MONO }}>
            {a.module_id}
          </div>
          <div className="mt-0.5 text-sm font-semibold text-ink">{a.title}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <Chip tone={urgent ? 'risk' : 'primary'} leadingIcon="clock">
              {daysLeft}d left
            </Chip>
            <span className="mono text-xs text-ink3" style={{ fontFamily: MONO }}>
              {Math.round(a.weight)}% of grade · {moduleName.split(' ')[0]}
            </span>
          </div>
        </div>
      </div>
    </Card>);
}
