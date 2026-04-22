import type { ModuleForm, StudySession } from '../types';
import { prettyDate } from '../utils/date';

export const WeekView = ({ loading, sessions, modules, onRefresh }: { loading: boolean; sessions: StudySession[]; modules: ModuleForm[]; onRefresh: () => void }) => {
  const grouped = sessions.reduce<Record<string, StudySession[]>>((acc, session) => {
    acc[session.session_date] ??= [];
    acc[session.session_date].push(session);
    return acc;
  }, {});

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Week view</h2>
        <button className="btn-secondary" onClick={onRefresh} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh week'}</button>
      </div>
      {Object.keys(grouped).length === 0 ? (
        <div className="card text-sm text-zinc-400">Generate a week plan after uploading your modules.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Object.entries(grouped).map(([day, daySessions]) => {
            const total = daySessions.reduce((sum, s) => sum + s.planned_minutes, 0);
            return (
              <article key={day} className="card">
                <div className="mb-3 flex items-center justify-between"><h3 className="font-medium">{prettyDate(day)}</h3><span className="text-sm text-zinc-400">{total} min</span></div>
                <ul className="space-y-2 text-sm text-zinc-300">
                  {daySessions.map((session) => (
                    <li key={session.id} className="flex items-center justify-between rounded border border-zinc-800 px-2 py-1">
                      <span>{modules.find((module) => module.id === session.module_id)?.name ?? session.module_id}</span>
                      <span className="text-zinc-400">{session.planned_minutes}m</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};
