import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import TodayHeader from '../components/TodayHeader';
import SessionCard from '../components/SessionCard';
import UpcomingPreview from '../components/UpcomingPreview';
import { AnimatePresence } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { api } from '@/api/client';

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  // A week of sessions: today's list plus the "Coming Up" preview.
  const { data } = useQuery({
    queryKey: ['daily-plan', user?.id, today],
    queryFn: () => api.getPlanRange(user.id, today, format(addDays(new Date(), 7), 'yyyy-MM-dd')),
    enabled: !!user,
  });

  const allSessions = data?.sessions ?? [];
  const todaySessions = allSessions.filter(s => s.session_date === today);
  const scheduledToday = todaySessions.filter(s => s.status === 'planned');
  const doneToday = todaySessions.filter(s => s.status === 'completed');
  const completedToday = doneToday.length;

  const streak = useMemo(() => {
    let count = 0;
    const sortedDates = [...new Set(
      allSessions.filter(s => s.status === 'completed').map(s => s.session_date ?? s.date)
    )].sort().reverse();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = format(new Date(Date.now() - (i * 86400000)), 'yyyy-MM-dd');
      if (sortedDates[i] === expected) count++;
      else break;
    }
    return count;
  }, [allSessions]);

  const handleComplete = (session) => {
    api.completeSession(session.id).then(() =>
      queryClient.invalidateQueries({ queryKey: ['daily-plan'] })
    );
  };

  // Skip = mark missed, then replan the remaining units around it.
  const handleMiss = async (session) => {
    try {
      await api.missSession(session.id);
      await api.reschedule({ user_id: user.id });
    } catch {
      // Refetch below still reconciles UI with server state.
    }
    queryClient.invalidateQueries({ queryKey: ['daily-plan'] });
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
  };

  return (
    <div>
      <TodayHeader sessionsToday={todaySessions.length} completedToday={completedToday} streak={streak} />

      {todaySessions.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary/40" />
          </div>
          <h3 className="font-heading font-semibold text-lg mb-1">No sessions today</h3>
          <p className="text-sm text-muted-foreground mb-4">Add modules and generate your study plan</p>
          <Link to="/modules">
            <Button className="rounded-xl">Get Started</Button>
          </Link>
        </div>
      ) : (
        <>
          {scheduledToday.length > 0 && (
            <div className="mb-4">
              <h2 className="font-heading font-semibold text-sm text-muted-foreground mb-2">To Do</h2>
              <div className="space-y-2">
                <AnimatePresence>
                  {scheduledToday.map(session => (
                    <SessionCard key={session.id} session={session} onComplete={handleComplete} onMiss={handleMiss} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
          {doneToday.length > 0 && (
            <div>
              <h2 className="font-heading font-semibold text-sm text-muted-foreground mb-2">Completed</h2>
              <div className="space-y-2">
                <AnimatePresence>
                  {doneToday.map(session => (
                    <SessionCard key={session.id} session={session} onComplete={handleComplete} onMiss={handleMiss} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </>
      )}

      <UpcomingPreview sessions={allSessions} />
    </div>
  );
}
