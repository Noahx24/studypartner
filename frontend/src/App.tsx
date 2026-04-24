import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api/client';
import { runSync } from './api/sync';
import { useOutboxCount } from './hooks/useOutboxCount';
import { P } from './ui/tokens';
import { TabBar, type TabId } from './ui/TabBar';
import { DashboardView } from './views/DashboardView';
import { TodayView } from './views/TodayView';
import { WeekView } from './views/WeekView';
import { CalendarView } from './views/CalendarView';
import { ModulesView } from './views/ModulesView';
import { ModuleDetailView } from './views/ModuleDetailView';
import { AssessmentsView } from './views/AssessmentsView';
import { TimerView } from './views/TimerView';
import { UploadView } from './views/UploadView';
import { SelectionView } from './views/SelectionView';
import { StudyPacksView } from './views/StudyPacksView';
import { PackReaderView } from './views/PackReaderView';
import { LandingView } from './views/LandingView';
import { FeedbackModal } from './components/FeedbackModal';
import type {
  AssessmentForm,
  ModuleContentResponse,
  ModuleForm,
  OnboardingData,
  PackPayload,
  StudySession,
  UserSettings,
} from './types';
import { isoDate, startOfWeek } from './utils/date';

type Route =
  | { name: 'home' }
  | { name: 'today' }
  | { name: 'week' }
  | { name: 'calendar' }
  | { name: 'modules' }
  | { name: 'module_detail'; moduleId: string }
  | { name: 'assessments' }
  | { name: 'timer'; session: StudySession }
  | { name: 'upload'; moduleId?: string }
  | { name: 'selection'; moduleId: string }
  | { name: 'packs'; moduleId: string; selectionId?: string }
  | { name: 'reader'; packId: string; payload: PackPayload };

const DEFAULT_USER: UserSettings = {
  userId: 'student-001',
  name: 'Student',
  email: 'student@studypartner.app',
  hours_per_day: 2,
  days_per_week: 4,
  pace: 'normal',
};

const TAB_FOR_ROUTE: Record<Route['name'], TabId> = {
  home: 'home',
  today: 'today',
  week: 'week',
  calendar: 'calendar',
  modules: 'modules',
  module_detail: 'modules',
  assessments: 'calendar',
  timer: 'today',
  upload: 'modules',
  selection: 'modules',
  packs: 'modules',
  reader: 'modules',
};

export function App() {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [user, setUser] = useState<UserSettings>(DEFAULT_USER);
  const [isOnboarded, setIsOnboarded] = useState(false);

  const [modules, setModules] = useState<ModuleForm[]>([]);
  const [assessments, setAssessments] = useState<AssessmentForm[]>([]);
  const [weekSessions, setWeekSessions] = useState<StudySession[]>([]);
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [moduleDetails, setModuleDetails] = useState<
    Record<string, { content?: ModuleContentResponse; totalMinutes: number }>
  >({});
  const [feedbackSession, setFeedbackSession] = useState<StudySession | null>(null);
  const [syncState, setSyncState] = useState<'online' | 'offline' | 'syncing'>('online');
  const outboxCount = useOutboxCount();
  const [error, setError] = useState<string | null>(null);
  const [activeSelectionId, setActiveSelectionId] = useState<string | null>(null);

  const loadPlans = useCallback(async (userId: string) => {
    const [week, today] = await Promise.all([api.generatePlan(userId), api.getDailyPlan(userId)]);
    setWeekSessions(week.sessions);
    setTodaySessions(today.sessions);
  }, []);

  useEffect(() => {
    const onOnline = () => setSyncState('online');
    const onOffline = () => setSyncState('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnboarded) return;
    void loadPlans(user.userId).catch((err) =>
      setError(err instanceof Error ? err.message : 'Failed to load plan'),
    );
  }, [isOnboarded, user.userId, loadPlans]);

  const completeOnboarding = async (data: OnboardingData) => {
    const days = Math.min(7, Math.max(3, Object.values(data.windows).filter(Boolean).length + 2));
    const nextUser: UserSettings = {
      ...user,
      hours_per_day: Number((data.weeklyHours / days).toFixed(1)),
      days_per_week: days,
    };
    await api.createUser(nextUser);
    await Promise.all(data.modules.map((m) => api.createModule(nextUser.userId, m)));
    setUser(nextUser);
    setModules(data.modules);
    setIsOnboarded(true);
  };

  const handleSync = async () => {
    if (syncState === 'syncing') return;
    setSyncState('syncing');
    setError(null);
    try {
      await runSync(user.userId);
      setSyncState(navigator.onLine ? 'online' : 'offline');
    } catch (err) {
      setSyncState(navigator.onLine ? 'online' : 'offline');
      setError(err instanceof Error ? err.message : 'Sync failed');
    }
  };

  const handleComplete = async (session: StudySession) => {
    try {
      await api.completeSession(session.id);
      setFeedbackSession(session);
      await loadPlans(user.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete session');
    }
  };

  const handleFeedbackSubmit = async (actualMinutes: number) => {
    if (!feedbackSession) return;
    try {
      await api.submitFeedback({
        user_id: user.userId,
        session_id: feedbackSession.id,
        actual_time_minutes: actualMinutes,
      });
      setFeedbackSession(null);
      await api.reschedule({ user_id: user.userId });
      await loadPlans(user.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit feedback');
    }
  };

  const fetchModuleDetails = useCallback(async (moduleId: string) => {
    const [content, units] = await Promise.all([
      api.getModuleContent(moduleId),
      api.getStudyUnits(moduleId),
    ]);
    const totalMinutes = units.study_units.reduce((sum, u) => sum + u.estimated_minutes, 0);
    setModuleDetails((prev) => ({ ...prev, [moduleId]: { content, totalMinutes } }));
  }, []);

  const addAssessment = async (a: AssessmentForm) => {
    await api.addAssessment(a);
    setAssessments((prev) => [...prev, a]);
  };

  const moduleById = useMemo(
    () => Object.fromEntries(modules.map((m) => [m.id, m])),
    [modules],
  );

  const navigateTab = (tab: TabId) => {
    const routeForTab: Record<TabId, Route> = {
      home: { name: 'home' },
      today: { name: 'today' },
      week: { name: 'week' },
      calendar: { name: 'calendar' },
      modules: { name: 'modules' },
    };
    setRoute(routeForTab[tab]);
  };

  if (!isOnboarded) {
    return <LandingView onDone={completeOnboarding} />;
  }

  const showTabs = route.name !== 'timer' && route.name !== 'reader';
  const currentTab = TAB_FOR_ROUTE[route.name];

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-[440px]" style={{ background: P.bg }}>
      {error && (
        <div
          className="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ background: P.coralSoft, color: P.coralDeep }}
        >
          {error}
          <button onClick={() => setError(null)} className="opacity-60">×</button>
        </div>
      )}

      {route.name === 'home' && (
        <DashboardView
          user={user}
          modules={modules}
          assessments={assessments}
          todaySessions={todaySessions}
          weekSessions={weekSessions}
          syncState={
            syncState === 'online' && outboxCount > 0 ? { queued: outboxCount } : syncState
          }
          onSync={handleSync}
          onStartSession={(s) => setRoute({ name: 'timer', session: s })}
          onOpenModules={() => setRoute({ name: 'modules' })}
          onOpenAssessments={() => setRoute({ name: 'assessments' })}
          onOpenModule={(id) => {
            void fetchModuleDetails(id);
            setRoute({ name: 'module_detail', moduleId: id });
          }}
        />
      )}

      {route.name === 'today' && (
        <TodayView
          user={user}
          modules={modules}
          sessions={todaySessions}
          onStartSession={(s) => setRoute({ name: 'timer', session: s })}
          onCompleteSession={handleComplete}
          onReschedule={async () => {
            await api.reschedule({ user_id: user.userId });
            await loadPlans(user.userId);
          }}
        />
      )}

      {route.name === 'week' && (
        <WeekView
          modules={modules}
          weekSessions={weekSessions}
          assessments={assessments}
        />
      )}

      {route.name === 'calendar' && (
        <CalendarView
          modules={modules}
          weekSessions={weekSessions}
          assessments={assessments}
          onOpenAssessments={() => setRoute({ name: 'assessments' })}
        />
      )}

      {route.name === 'modules' && (
        <ModulesView
          modules={modules}
          weekSessions={weekSessions}
          assessments={assessments}
          onOpenModule={(id) => {
            void fetchModuleDetails(id);
            setRoute({ name: 'module_detail', moduleId: id });
          }}
          onUpload={() => setRoute({ name: 'upload' })}
        />
      )}

      {route.name === 'module_detail' && (
        <ModuleDetailView
          module={moduleById[route.moduleId]}
          detail={moduleDetails[route.moduleId]}
          assessments={assessments.filter((a) => a.module_id === route.moduleId)}
          onBack={() => setRoute({ name: 'modules' })}
          onPlan={() => setRoute({ name: 'selection', moduleId: route.moduleId })}
          onPacks={() => setRoute({ name: 'packs', moduleId: route.moduleId, selectionId: activeSelectionId ?? undefined })}
          onUpload={() => setRoute({ name: 'upload', moduleId: route.moduleId })}
        />
      )}

      {route.name === 'assessments' && (
        <AssessmentsView
          modules={modules}
          assessments={assessments}
          onBack={() => setRoute({ name: 'calendar' })}
          onAdd={addAssessment}
        />
      )}

      {route.name === 'timer' && (
        <TimerView
          session={route.session}
          module={moduleById[route.session.module_id]}
          onClose={() => setRoute({ name: 'today' })}
          onComplete={async () => {
            await handleComplete(route.session);
            setRoute({ name: 'today' });
          }}
        />
      )}

      {route.name === 'upload' && (
        <UploadView
          modules={modules}
          moduleId={route.moduleId}
          userId={user.userId}
          onBack={() => setRoute({ name: 'modules' })}
          onUploaded={async (moduleId) => {
            await fetchModuleDetails(moduleId);
            await loadPlans(user.userId);
          }}
        />
      )}

      {route.name === 'selection' && (
        <SelectionView
          userId={user.userId}
          moduleId={route.moduleId}
          onBack={() => setRoute({ name: 'module_detail', moduleId: route.moduleId })}
          onSelectionSaved={(sid) => {
            setActiveSelectionId(sid);
            setRoute({ name: 'packs', moduleId: route.moduleId, selectionId: sid });
          }}
        />
      )}

      {route.name === 'packs' && (
        <StudyPacksView
          userId={user.userId}
          moduleId={route.moduleId}
          activeSelectionId={route.selectionId ?? activeSelectionId}
          onBack={() => setRoute({ name: 'module_detail', moduleId: route.moduleId })}
          onOpenPack={(pid, payload) => setRoute({ name: 'reader', packId: pid, payload })}
        />
      )}

      {route.name === 'reader' && (
        <PackReaderView
          pack_id={route.packId}
          payload={route.payload}
          onClose={() => setRoute({ name: 'modules' })}
        />
      )}

      <FeedbackModal
        open={Boolean(feedbackSession)}
        estimated={feedbackSession?.planned_minutes ?? 0}
        onClose={() => setFeedbackSession(null)}
        onSubmit={handleFeedbackSubmit}
      />

      {showTabs && <TabBar active={currentTab} onChange={navigateTab} />}

      {/* No-op reference to silence unused warnings in dev */}
      <div style={{ display: 'none' }}>{isoDate(startOfWeek(new Date()))}</div>
    </main>
  );
}
