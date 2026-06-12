import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  isSameMonth, isToday, parseISO, isSameDay, addMonths, subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, GraduationCap, ClipboardCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DayDot({ type }) {
  const colors = {
    session: 'bg-primary',
    exam: 'bg-destructive',
    assignment: 'bg-accent',
    completed: 'bg-emerald-500',
  };
  return <span className={cn("w-1.5 h-1.5 rounded-full inline-block", colors[type] || 'bg-muted')} />;
}

// Exams are user-entered assessments; distinguish them from assignment
// deadlines by title so the calendar can colour them differently.
const isExam = (a) => /exam|examination/i.test(a.title);

export default function CalendarView({ embedded = false }) {
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const monthStart = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');

  const { data: sessionsData } = useQuery({
    queryKey: ['sessions-range', user?.id, monthStart],
    queryFn: () => api.getSessionsRange(user.id, monthStart, monthEnd),
    enabled: !!user,
  });
  const sessions = useMemo(
    () => (sessionsData?.sessions ?? []).map((s) => ({ ...s, date: s.session_date })),
    [sessionsData],
  );

  const { data: assessmentsData } = useQuery({
    queryKey: ['assessments', user?.id],
    queryFn: () => api.listAssessments(),
    enabled: !!user,
  });
  const assessments = useMemo(
    () =>
      (assessmentsData?.assessments ?? []).map((a) => ({
        ...a,
        subject: a.module_name,
      })),
    [assessmentsData],
  );

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const paddingStart = getDay(startOfMonth(currentMonth)); // 0=Sun

  const getDotsForDay = (day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dots = [];
    const daySessions = sessions.filter(s => s.date === dateStr);
    if (daySessions.some(s => s.status === 'completed')) dots.push('completed');
    else if (daySessions.length > 0) dots.push('session');
    const dayAssessments = assessments.filter(a => a.due_date === dateStr);
    if (dayAssessments.some(isExam)) dots.push('exam');
    if (dayAssessments.some(a => !isExam(a))) dots.push('assignment');
    return dots;
  };

  const selectedDateStr = format(selectedDay, 'yyyy-MM-dd');
  const dayItems = [
    ...sessions
      .filter(s => s.date === selectedDateStr)
      .map(s => ({ type: 'session', data: s })),
    ...assessments
      .filter(a => a.due_date === selectedDateStr)
      .map(a => ({ type: isExam(a) ? 'exam' : 'assignment', data: a })),
  ];

  return (
    <div>
      {!embedded && (
        <div className="mb-6">
          <h1 className="font-heading text-3xl font-bold tracking-tight">Calendar</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Sessions, exams &amp; assignments</p>
        </div>
      )}

      {/* Month header */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden mb-4">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <button onClick={() => setCurrentMonth(m => subMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-heading font-semibold text-sm">{format(currentMonth, 'MMMM yyyy')}</span>
          <button onClick={() => setCurrentMonth(m => addMonths(m, 1))} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* DOW headers */}
        <div className="grid grid-cols-7 border-b border-border/50">
          {DOW.map(d => (
            <div key={d} className="text-[10px] font-semibold text-muted-foreground text-center py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
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
                  "aspect-square flex flex-col items-center justify-center gap-0.5 transition-all relative",
                  selected ? "bg-primary text-primary-foreground rounded-xl m-0.5" :
                  today ? "text-primary font-bold" : "text-foreground hover:bg-muted/60"
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

      {/* Legend */}
      <div className="flex gap-3 mb-4 flex-wrap">
        {[
          { color: 'bg-primary', label: 'Study session' },
          { color: 'bg-emerald-500', label: 'Completed' },
          { color: 'bg-destructive', label: 'Exam' },
          { color: 'bg-accent', label: 'Assignment' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full", l.color)} />
            <span className="text-[11px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Selected Day Details */}
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
                return (
                  <div key={i} className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border shadow-sm",
                    completed ? "bg-emerald-50/40 border-emerald-200" : "bg-card border-border/50"
                  )}>
                    {completed
                      ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                      : <Clock className="w-5 h-5 text-primary/60 flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.subject}{s.start_time ? ` · ${s.start_time}` : ''}{s.duration_minutes ? ` · ${s.duration_minutes}min` : ''}
                      </p>
                    </div>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium",
                      completed ? "bg-emerald-100 text-emerald-700" : "bg-primary/10 text-primary"
                    )}>
                      {completed ? 'Done' : 'Study'}
                    </span>
                  </div>
                );
              }
              if (item.type === 'exam') {
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-destructive/20 bg-destructive/5">
                    <GraduationCap className="w-5 h-5 text-destructive flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-destructive truncate">{item.data.title}</p>
                      <p className="text-xs text-muted-foreground">{item.data.subject}</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-destructive/10 text-destructive">EXAM</span>
                  </div>
                );
              }
              if (item.type === 'assignment') {
                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-accent/30 bg-accent/5">
                    <ClipboardCheck className="w-5 h-5 text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-accent truncate">{item.data.title}</p>
                      <p className="text-xs text-muted-foreground">{item.data.subject}</p>
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