import { useState } from 'react';
import { StatusPill } from '../components/StatusPill';
import type { ModuleForm, StudySession } from '../types';

export const TodayView = ({
  loading,
  sessions,
  modules,
  onRefresh,
  onComplete,
  onReschedule,
}: {
  loading: boolean;
  sessions: StudySession[];
  modules: ModuleForm[];
  onRefresh: () => void;
  onComplete: (sessionId: string) => Promise<void>;
  onReschedule: () => Promise<void>;
}) => {
  const [activeTimer, setActiveTimer] = useState<string | null>(null);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Today</h2>
          <p className="text-sm text-zinc-400">Focus on your next session.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={loading} onClick={onRefresh}>{loading ? 'Loading…' : 'Refresh'}</button>
          <button className="btn-secondary" disabled={loading} onClick={onReschedule}>Reschedule</button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="card text-sm text-zinc-400">Upload content to get started.</div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => {
            const module = modules.find((m) => m.id === session.module_id);
            return (
              <li key={session.id} className="card">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{module?.name ?? session.module_id}</p>
                    <p className="text-sm text-zinc-400">Topic: {session.unit_id} · {session.planned_minutes} min</p>
                    <StatusPill status={session.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" onClick={() => setActiveTimer(activeTimer === session.id ? null : session.id)}>
                      {activeTimer === session.id ? 'Stop timer' : 'Start session'}
                    </button>
                    <button className="btn-primary" onClick={() => onComplete(session.id)} disabled={session.status === 'completed'}>
                      Mark complete
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
