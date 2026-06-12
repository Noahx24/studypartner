import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import GeneratePlanButton from '../components/plan/GeneratePlanButton';
import PlanDayGroup from '../components/plan/PlanDayGroup';
import CalendarView from './CalendarView';
import { ClipboardList, Info, List, CalendarDays, AlertTriangle } from 'lucide-react';
import { addDays, differenceInDays, format, parseISO } from 'date-fns';
import { moduleCode } from '@/lib/moduleColors';
import { cn } from '@/lib/utils';

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key];
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

const iso = (d) => format(d, 'yyyy-MM-dd');

export default function StudyPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [view, setView] = useState('list'); // 'list' | 'calendar'

  const today = new Date();

  const { data: catchUp } = useQuery({
    queryKey: ['catch-up', user?.id],
    queryFn: () => api.getCatchUp(user.id),
    enabled: !!user,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['sessions', user?.id],
    // The plan view covers the week ahead, not just today.
    queryFn: () => api.getSessionsRange(user.id, iso(today), iso(addDays(today, 7))),
    enabled: !!user,
  });

  const { data: assessmentsData } = useQuery({
    queryKey: ['assessments', user?.id],
    queryFn: () => api.listAssessments(),
    enabled: !!user,
  });

  const sessions = (data?.sessions ?? []).filter((s) => s.status !== 'missed');
  const planned = sessions.filter((s) => s.status === 'planned');
  const groupedSessions = groupBy(sessions, 'session_date');
  const sortedDates = Object.keys(groupedSessions).sort();

  // Deadlines landing inside the planning window — surfaced like the
  // design's "2 deadlines in 3 days" callout.
  const upcoming = (assessmentsData?.assessments ?? [])
    .filter((a) => {
      const days = differenceInDays(parseISO(a.due_date), today);
      return days >= 0 && days <= 7;
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="h-24 w-full rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-3">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Study Plan</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {planned.length > 0
              ? `Next 7 days · ${planned.length} session${planned.length === 1 ? '' : 's'}`
              : 'Your week, planned around your deadlines'}
          </p>
        </div>
        {/* List / Calendar toggle */}
        <div className="flex rounded-xl border bg-muted/50 p-1 shrink-0">
          {[
            { k: 'list', label: 'List', Icon: List },
            { k: 'calendar', label: 'Calendar', Icon: CalendarDays },
          ].map(({ k, label, Icon }) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all',
                view === k ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <GeneratePlanButton
          userId={user?.id}
          onGenerated={() => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            queryClient.invalidateQueries({ queryKey: ['sessions-range'] });
          }}
        />
      </div>

      {catchUp?.count > 0 && (
        <Link
          to="/catch-up"
          className="flex items-center gap-3 rounded-2xl bg-destructive/5 border border-destructive/20 p-4 mb-4"
        >
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-destructive">
              {catchUp.count} missed session{catchUp.count === 1 ? '' : 's'}
            </p>
            <p className="text-xs text-muted-foreground">Tap to catch up — we'll refit them into free time.</p>
          </div>
        </Link>
      )}

      {view === 'calendar' ? (
        <CalendarView embedded />
      ) : (
        <>
      {upcoming.length > 0 && (
        <div className="mb-6 rounded-2xl bg-secondary border border-primary/10 p-4 flex gap-3">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary">
              {upcoming.length} deadline{upcoming.length === 1 ? '' : 's'} in the next 7 days
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {upcoming
                .slice(0, 2)
                .map((a) => `${moduleCode(a.module_name)} · ${format(parseISO(a.due_date), 'EEE d MMM')}`)
                .join('  ·  ')}
              {upcoming.length > 2 ? `  +${upcoming.length - 2} more` : ''}
            </p>
          </div>
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1">No plan yet</h3>
          <p className="text-sm text-muted-foreground">
            Tap “Plan my week” and we’ll fit your modules into the time you have.
          </p>
        </div>
      ) : (
        <div>
          {sortedDates.map(date => (
            <PlanDayGroup
              key={date}
              date={date}
              sessions={groupedSessions[date]}
              onComplete={(session) =>
                api.completeSession(session.id).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['sessions'] });
                  queryClient.invalidateQueries({ queryKey: ['sessions-range'] });
                })
              }
              onMiss={(session) =>
                api.skipSession(session.id).then(() => {
                  queryClient.invalidateQueries({ queryKey: ['sessions'] });
                  queryClient.invalidateQueries({ queryKey: ['sessions-range'] });
                  queryClient.invalidateQueries({ queryKey: ['catch-up'] });
                })
              }
            />
          ))}
        </div>
      )}
        </>
      )}
    </div>
  );
}
