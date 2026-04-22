import { StatusPill } from '../components/StatusPill';
import type { StudySession, WeeklySummary } from '../types';

export const DashboardView = ({
  loading,
  metrics,
  summaries,
  sessions,
  onRefresh,
}: {
  loading: boolean;
  metrics: { totalModules: number; totalSessions: number; doneSessions: number; progress: number; onTrack: 'green' | 'yellow' | 'red' };
  summaries: WeeklySummary[];
  sessions: StudySession[];
  onRefresh: () => void;
}) => {
  const upcoming = sessions.filter((session) => session.status === 'planned').slice(0, 5);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <button className="btn-secondary" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <article className="card"><p className="text-sm text-zinc-400">Total modules</p><p className="mt-1 text-2xl">{metrics.totalModules}</p></article>
        <article className="card"><p className="text-sm text-zinc-400">Upcoming sessions</p><p className="mt-1 text-2xl">{upcoming.length}</p></article>
        <article className="card"><p className="text-sm text-zinc-400">Weekly progress</p><p className="mt-1 text-2xl">{metrics.progress}%</p></article>
        <article className="card"><p className="text-sm text-zinc-400">On-track status</p><div className="mt-2"><StatusPill status={metrics.onTrack} /></div></article>
      </div>

      <div className="card">
        <div className="mb-2 flex justify-between text-sm text-zinc-400"><span>Completed sessions</span><span>{metrics.doneSessions}/{metrics.totalSessions}</span></div>
        <div className="h-2 rounded-full bg-zinc-800">
          <div className="h-2 rounded-full bg-white transition-all" style={{ width: `${metrics.progress}%` }} />
        </div>
      </div>

      <div className="card">
        <h3 className="mb-3 text-sm font-medium text-zinc-200">Module load</h3>
        {summaries.length === 0 ? (
          <p className="text-sm text-zinc-400">Upload content to get started.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {summaries.map((item) => (
              <li key={item.module_id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
                <span>{item.module_id}</span>
                <span className="text-zinc-400">{item.planned_minutes} min</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
