import type { StudySession } from '../types';

type TodayStatus = 'not_started' | 'in_progress' | 'completed';

const statusClass: Record<TodayStatus, string> = {
  not_started: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

export function SessionCard({
  session,
  moduleName,
  slot,
  status,
  onStart,
  onComplete,
}: {
  session: StudySession;
  moduleName: string;
  slot: string;
  status: TodayStatus;
  onStart: () => void;
  onComplete: () => void;
}) {
  return (
    <article className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">{moduleName}</p>
          <p className="text-sm text-slate-500">{session.unit_id}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusClass[status]}`}>{status.replace('_', ' ')}</span>
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span>{session.planned_minutes} min</span>
        <span>•</span>
        <span>{slot}</span>
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary flex-1" onClick={onStart} disabled={status === 'completed'}>
          {status === 'in_progress' ? 'In progress' : 'Start'}
        </button>
        <button className="btn-primary flex-1" onClick={onComplete} disabled={status === 'completed'}>
          Mark complete
        </button>
      </div>
    </article>
  );
}
