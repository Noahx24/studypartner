import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isToday, isSameDay, addMonths, subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, ClipboardCheck, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DayDot({ type }) {
  const colors = {
    session: 'bg-primary',
    exam: 'bg-destructive',
    assignment: 'bg-accent',
    completed: 'bg-emerald-500',
    missed: 'bg-amber-500',
  };
  return <span className={cn('w-1.5 h-1.5 rounded-full inline-block', colors[type] || 'bg-muted')} />;
}

/**
 * Calendar view of the student's plan + assessments.
 *
 * Was previously broken: the JSX referenced `sessions` and `modules`
 * variables that were never declared — the whole page threw a
 * ReferenceError on render and only "worked" after manual refresh
 * because some other state ended up populated. Now both are fetched
 * via tanstack-query against the existing backend endpoints.
 */
export default function CalendarView() {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const monthKey = useMemo(() => format(startOfMonth(currentMonth), 'yyyy-MM'), [currentMonth]);

  // generatePlan returns the *current* week's sessions; it's the
  // closest backend surface to a calendar feed. Far-future months
  // won't have data yet — that's a follow-up. Today and this week
  // are the high-value paths.
  const { data: planData } = useQuery({
    queryKey: ['weekly-plan', user?.id, monthKey],
    queryFn: () => api.generatePlan(user.id),
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: modulesData } = useQuery({
    queryKey: ['modules-list', user?.id],
    queryFn: () => api.listModules(),
    enabled: !!user,
  });

  const sessions = planData?.sessions ?? [];
  const modules = modulesData?.modules ?? [];

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const paddingStart = getDay(startOfMonth(currentMonth));
  const sessionDate = (s) => s.session_date ?? s.date;

  const getDotsForDay = (day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dots = [];
    const daySessions = sessions.filter((s) => sessionDate(s) === dateStr);
    if (daySessions.some((s) => s.status === 'completed')) dots.push('completed');
    else if (daySessions.some((s) => s.status === 'missed')) dots.push('missed');
    else if (daySessions.length > 0) dots.push('session');
    if (modules.some((m) => m.next_due_date === dateStr)) dots.push('assignment');
    return dots;
  };

  const selectedDateStr = format(selectedDay, 'yyyy-MM-dd');
  const moduleNameById = Object.fromEntries(modules.map((m) => [m.id, m.name]));

  const dayItems = [
    ...sessions
      .filter((s) => sessionDate(s) === selectedDateStr)
      .map((s) => ({ type: 'session', data: s })),
    ...modules
      .filter((m) => m.next_due_date === selectedDateStr)
      .map((m) => ({ type: 'assignment', data: m })),
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">Calendar</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Sessions, exams &amp; assignments</p>
      </div>

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-heading font-semibold text-sm">{format(currentMonth, 'MMMM yyyy')}</span>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-border/50">
          {DOW.map((d) => (
            <div key={d} className="text-[10px] font-semibold text-muted-foreground text-center py-2">
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {Array(paddingStart).fill(null).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {days.map((day) => {
            const dots = getDotsForDay(day);
            const selected = isSameDay(day, selectedDay);
            const today = isToday(day);
            return (
              <button
                key={day.toISOString()}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  'aspect-square flex flex-col items-center justify-center gap-0.5 transition-all relative',
                  selected ? 'bg-primary text-primary-foreground rounded-xl m-0.5' :
                  today ? 'text-primary font-bold' : 'text-foreground hover:bg-muted/60',
                )}
              >
                <span className="text-xs leading-none">{format(day, 'd')}</span>
                {dots.length > 0 && (
                  <div className="flex gap-0.5">
                    {dots.slice(0, 3).map((dot, i) => (
                      <DayDot key={i} type={selected ? 'session' : dot} />
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { color: 'bg-primary', label: 'Study session' },
          { color: 'bg-emerald-500', label: 'Completed' },
          { color: 'bg-amber-500', label: 'Missed' },
          { color: 'bg-accent', label: 'Assignment due' },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', l.color)} />
            <span className="text-[11px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>

      <div>
        <h2 className="font-heading font-semibold text-sm text-muted-foreground mb-2">
          {isToday(selectedDay) ? 'Today' : format(selectedDay, 'EEEE, MMMM d')}
        </h2>

        {dayItems.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground bg-card rounded-xl border border-border/50">
            Nothing scheduled
          </div>
        ) : (
          <div className="space-y-2">
            {dayItems.map((item, i) => {
              if (item.type === 'session') {
                const s = item.data;
                const completed = s.status === 'completed';
                const missed = s.status === 'missed';
                const Icon = completed ? CheckCircle2 : missed ? XCircle : Clock;
                const iconColor = completed ? 'text-emerald-500' : missed ? 'text-amber-500' : 'text-primary/60';
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-xl border shadow-sm bg-card border-border/50',
                      completed && 'bg-emerald-50/40 border-emerald-200',
                      missed && 'bg-amber-50/40 border-amber-200',
                    )}
                  >
                    <Icon className={cn('w-5 h-5 flex-shrink-0', iconColor)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {moduleNameById[s.module_id] ?? s.module_id}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.planned_minutes} min</p>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium',
                        completed ? 'bg-emerald-100 text-emerald-700' :
                        missed ? 'bg-amber-100 text-amber-700' :
                        'bg-primary/10 text-primary',
                      )}
                    >
                      {completed ? 'Done' : missed ? 'Missed' : 'Study'}
                    </span>
                  </div>
                );
              }
              if (item.type === 'assignment') {
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-accent/30 bg-accent/5">
                    <ClipboardCheck className="w-5 h-5 text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-accent truncate">{item.data.name}</p>
                      <p className="text-xs text-muted-foreground">Assessment due</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-accent/10 text-accent">DUE</span>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
