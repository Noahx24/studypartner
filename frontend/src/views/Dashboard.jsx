import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, differenceInDays } from 'date-fns';
import TodayHeader from '../components/dashboard/TodayHeader';
import SessionCard from '../components/dashboard/SessionCard';
import UpcomingPreview from '../components/dashboard/UpcomingPreview';
import { AnimatePresence } from 'framer-motion';
import { BookOpen, AlertTriangle, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const today = format(new Date(), 'yyyy-MM-dd');

  const todaySessions = allSessions.filter(s => s.date === today);
  const completedToday = todaySessions.filter(s => s.status === 'completed').length;

  const streak = useMemo(() => {
    let count = 0;
    const sortedDates = [...new Set(
      allSessions.filter(s => s.status === 'completed').map(s => s.date)
    )].sort().reverse();
    for (let i = 0; i < sortedDates.length; i++) {
      const expected = format(new Date(Date.now() - (i * 86400000)), 'yyyy-MM-dd');
      if (sortedDates[i] === expected) count++;
      else break;
    }
    return count;
  }, [allSessions]);

  // Urgent deadlines in next 5 days
  const urgentDeadlines = modules
    .filter(m => {
      const d = m.assignment_date || m.exam_date;
      if (!d) return false;
      const days = differenceInDays(parseISO(d), new Date());
      return days >= 0 && days <= 5;
    })
    .sort((a, b) => {
      const aDate = a.assignment_date || a.exam_date;
      const bDate = b.assignment_date || b.exam_date;
      return aDate.localeCompare(bDate);
    });


  return (
    <div>
      <TodayHeader sessionsToday={todaySessions.length} completedToday={completedToday} streak={streak} />

      {/* Urgent Deadlines Banner */}
      {urgentDeadlines.length > 0 && (
        <div className="mb-4 bg-destructive/5 border border-destructive/20 rounded-2xl p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-xs font-bold text-destructive">Deadline Alert</span>
          </div>
          {urgentDeadlines.map(m => {
            const d = m.assignment_date || m.exam_date;
            const days = differenceInDays(parseISO(d), new Date());
            const isAssign = !!m.assignment_date;
            return (
              <div key={m.id} className="flex items-center justify-between text-xs">
                <span className="font-medium truncate">{m.title}</span>
                <span className={cn("ml-2 flex-shrink-0 font-semibold flex items-center gap-1",
                  days <= 1 ? "text-destructive" : "text-muted-foreground")}>
                  <Calendar className="w-3 h-3" />
                  {days === 0 ? 'Today!' : days === 1 ? 'Tomorrow' : `${days}d`}
                  {' · '}{isAssign ? 'Assignment' : 'Exam'}
                </span>
              </div>
            );
          })}
        </div>
      )}

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