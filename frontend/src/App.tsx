import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import type { ModuleForm, StudySession, UserSettings, WeeklySummary } from './types';
import { api } from './api/client';
import { DashboardView } from './views/DashboardView';
import { LandingView } from './views/LandingView';
import { TodayView } from './views/TodayView';
import { WeekView } from './views/WeekView';
import { UploadView } from './views/UploadView';
import { SettingsView } from './views/SettingsView';

const navItems = [
  { to: '/app/dashboard', label: 'Dashboard' },
  { to: '/app/today', label: 'Today' },
  { to: '/app/week', label: 'Week' },
  { to: '/app/upload', label: 'Upload' },
  { to: '/app/settings', label: 'Settings' },
];

export function App() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    userId: 'demo-user',
    name: 'Study Partner User',
    email: 'study@partner.app',
    hours_per_day: 2,
    days_per_week: 5,
    pace: 'normal',
  });
  const [modules, setModules] = useState<ModuleForm[]>([]);
  const [weekSessions, setWeekSessions] = useState<StudySession[]>([]);
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [summaries, setSummaries] = useState<WeeklySummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createOrUpdateUser = async (next: UserSettings) => {
    setLoading(true);
    setError(null);
    try {
      await api.createUser(next);
      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings');
    } finally {
      setLoading(false);
    }
  };

  const refreshWeek = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getWeekPlan(settings.userId);
      setWeekSessions(result.sessions);
      setSummaries(result.summaries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load week plan');
    } finally {
      setLoading(false);
    }
  };

  const refreshToday = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTodayPlan(settings.userId);
      setTodaySessions(result.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load today plan');
    } finally {
      setLoading(false);
    }
  };

  const completeSession = async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.completeSession(sessionId);
      await Promise.all([refreshToday(), refreshWeek()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete session');
      setLoading(false);
    }
  };

  const registerModule = (module: ModuleForm) => {
    setModules((current) => {
      if (current.some((item) => item.id === module.id)) return current;
      return [...current, module];
    });
  };

  const metrics = useMemo(() => {
    const done = weekSessions.filter((s) => s.status === 'completed').length;
    const total = weekSessions.length;
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);
    return {
      totalModules: modules.length,
      totalSessions: total,
      doneSessions: done,
      progress,
      onTrack: progress >= 70 ? 'green' : progress >= 40 ? 'yellow' : 'red',
    } as const;
  }, [modules.length, weekSessions]);

  return (
    <div className="min-h-screen bg-surface text-white">
      <Routes>
        <Route path="/" element={<LandingView onEnter={() => navigate('/app/today')} />} />
        <Route
          path="/app/*"
          element={
            <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 md:px-6">
              <header className="mb-6 flex flex-col gap-3 border-b border-zinc-800 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h1 className="text-xl font-semibold">StudyPartner</h1>
                  <p className="text-sm text-zinc-400">AI planning dashboard</p>
                </div>
                <nav className="flex flex-wrap gap-2">
                  {navItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-zinc-100 text-black' : 'bg-zinc-900 text-zinc-200 hover:bg-zinc-800'}`
                      }
                    >
                      {item.label}
                    </NavLink>
                  ))}
                </nav>
              </header>

              {error && <div className="mb-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div>}

              <Routes>
                <Route path="dashboard" element={<DashboardView loading={loading} metrics={metrics} summaries={summaries} sessions={weekSessions} onRefresh={refreshWeek} />} />
                <Route
                  path="today"
                  element={<TodayView loading={loading} sessions={todaySessions} modules={modules} onRefresh={refreshToday} onComplete={completeSession} onReschedule={async () => api.reschedule(settings.userId).then(refreshToday)} />}
                />
                <Route path="week" element={<WeekView loading={loading} sessions={weekSessions} modules={modules} onRefresh={refreshWeek} />} />
                <Route
                  path="upload"
                  element={<UploadView userId={settings.userId} loading={loading} modules={modules} onLoading={setLoading} onModuleCreated={registerModule} onWeekRefresh={refreshWeek} />}
                />
                <Route path="settings" element={<SettingsView settings={settings} loading={loading} onSave={createOrUpdateUser} />} />
                <Route path="*" element={<TodayView loading={loading} sessions={todaySessions} modules={modules} onRefresh={refreshToday} onComplete={completeSession} onReschedule={async () => api.reschedule(settings.userId).then(refreshToday)} />} />
              </Routes>
            </div>
          }
        />
      </Routes>
    </div>
  );
}
