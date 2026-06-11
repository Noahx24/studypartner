import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';
import GeneratePlanButton from '../components/plan/GeneratePlanButton';
import PlanDayGroup from '../components/plan/PlanDayGroup';
import { ClipboardList } from 'lucide-react';

function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key];
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

export default function StudyPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Two weeks from today — the generated plan spans a week, so this
  // always covers the current plan plus any spillover reschedules.
  const { data, isLoading } = useQuery({
    queryKey: ['sessions', user?.id],
    queryFn: () =>
      api.getPlanRange(
        user.id,
        format(new Date(), 'yyyy-MM-dd'),
        format(addDays(new Date(), 13), 'yyyy-MM-dd'),
      ),
    enabled: !!user,
  });

  const sessions = data?.sessions ?? [];
  const groupedSessions = groupBy(sessions, 'session_date');
  const sortedDates = Object.keys(groupedSessions).sort();

  const refetchPlans = () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['daily-plan'] });
  };

  const handleComplete = async (session) => {
    try {
      await api.completeSession(session.id);
    } catch {
      // Refetch reconciles UI with server state either way.
    }
    refetchPlans();
  };

  // Skip = mark missed, then replan the remaining units around it.
  const handleMiss = async (session) => {
    try {
      await api.missSession(session.id);
      await api.reschedule({ user_id: user.id });
    } catch {
      // Refetch reconciles UI with server state either way.
    }
    refetchPlans();
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="h-24 w-full rounded-xl bg-slate-100 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Study Plan</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Deadline-driven AI schedule</p>
        </div>
      </div>

      <div className="mb-6">
        <GeneratePlanButton
          userId={user?.id}
          onGenerated={() => queryClient.invalidateQueries({ queryKey: ['sessions'] })}
        />
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1">No plan yet</h3>
          <p className="text-sm text-muted-foreground">
            Add modules, set your profile schedule, then generate a plan
          </p>
        </div>
      ) : (
        <div>
          {sortedDates.map(date => (
            <PlanDayGroup
              key={date}
              date={date}
              sessions={groupedSessions[date]}
              onComplete={handleComplete}
              onMiss={handleMiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
