import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import GeneratePlanButton from '../components/plan/GeneratePlanButton';
import PlanDayGroup from '../components/plan/PlanDayGroup';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import _ from 'lodash';

export default function StudyPlan() {
  const queryClient = useQueryClient();


  const handleComplete = (session) => {
    updateSession.mutate({ id: session.id, data: { status: 'completed' } });
  };

  const handleMiss = (session) => {
    updateSession.mutate({ id: session.id, data: { status: 'missed' } });
  };


  const groupedSessions = _.groupBy(sessions, 'date');
  const sortedDates = Object.keys(groupedSessions).sort();
  const hasScheduled = sessions.some(s => s.status === 'scheduled');

  if (loadingSessions) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full rounded-xl" />
        {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">Study Plan</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Deadline-driven AI schedule
          </p>
        </div>
        {hasScheduled && (
          <Button variant="ghost" size="sm" onClick={handleClearPlan} className="text-muted-foreground">
            <Trash2 className="w-4 h-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="mb-6">
        <GeneratePlanButton
          materials={materials}
          availability={availability}
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