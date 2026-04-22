import { useEffect, useMemo, useState } from 'react';
import { api } from './api/client';
import { FeedbackModal } from './components/FeedbackModal';
import { ModuleCard } from './components/ModuleCard';
import { OnboardingStep } from './components/OnboardingStep';
import { ProgressBar } from './components/ProgressBar';
import { SessionCard } from './components/SessionCard';
import { WeeklyGrid } from './components/WeeklyGrid';
import type { AssessmentForm, ModuleContentResponse, ModuleForm, OnboardingData, StudySession, UserSettings } from './types';
import { isoDate, prettyDate, startOfWeek } from './utils/date';

type Tab = 'dashboard' | 'today' | 'week' | 'modules' | 'upload';

const emptyOnboarding: OnboardingData = {
  weeklyHours: 8,
  windows: { morning: true, lunch: false, evening: true, weekend: true },
  modules: [],
};

const slotForIndex = (index: number, windows: OnboardingData['windows']) => {
  const preferred = Object.entries(windows)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
  const cycle = preferred.length > 0 ? preferred : ['evening'];
  return cycle[index % cycle.length];
};

const fmtSlot = (slot: string) => ({ morning: 'Morning', lunch: 'Lunch', evening: 'Evening', weekend: 'Weekend' }[slot] ?? 'Flexible');

export function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] = useState(1);
  const [onboarding, setOnboarding] = useState<OnboardingData>(emptyOnboarding);
  const [isOnboarded, setIsOnboarded] = useState(false);

  const [user, setUser] = useState<UserSettings>({
    userId: 'student-001',
    name: 'Student',
    email: 'student@studypartner.app',
    hours_per_day: 2,
    days_per_week: 4,
    pace: 'normal',
  });

  const [modules, setModules] = useState<ModuleForm[]>([]);
  const [assessments, setAssessments] = useState<AssessmentForm[]>([]);
  const [weekSessions, setWeekSessions] = useState<StudySession[]>([]);
  const [todaySessions, setTodaySessions] = useState<StudySession[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, boolean>>({});
  const [feedbackSession, setFeedbackSession] = useState<StudySession | null>(null);
  const [moduleDetails, setModuleDetails] = useState<Record<string, { content?: ModuleContentResponse; totalMinutes: number }>>({});
  const [uploadForm, setUploadForm] = useState({ moduleId: '', pastedText: '', file: undefined as File | undefined });
  const [calendarMode, setCalendarMode] = useState<'week' | 'month'>('week');

  const loadPlans = async (userId: string) => {
    const [week, today] = await Promise.all([api.generatePlan(userId), api.getDailyPlan(userId)]);
    setWeekSessions(week.sessions);
    setTodaySessions(today.sessions);
  };

  const saveOnboarding = async () => {
    setLoading(true);
    setError(null);
    try {
      const days = Math.min(7, Math.max(3, Object.values(onboarding.windows).filter(Boolean).length + 2));
      const nextUser = { ...user, hours_per_day: Number((onboarding.weeklyHours / days).toFixed(1)), days_per_week: days };
      await api.createUser(nextUser);
      await Promise.all(onboarding.modules.map((module) => api.createModule(nextUser.userId, module)));
      setUser(nextUser);
      setModules(onboarding.modules);
      setIsOnboarded(true);
      await loadPlans(nextUser.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  const handleStart = (sessionId: string) => {
    setActiveSessions((prev) => ({ ...prev, [sessionId]: true }));
  };

  const handleComplete = async (session: StudySession) => {
    setLoading(true);
    setError(null);
    try {
      await api.completeSession(session.id);
      setFeedbackSession(session);
      await loadPlans(user.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to complete session');
    } finally {
      setLoading(false);
    }
  };

  const handleFeedbackSubmit = async (actualMinutes: number) => {
    if (!feedbackSession) return;
    setLoading(true);
    setError(null);
    try {
      await api.submitFeedback({ user_id: user.userId, session_id: feedbackSession.id, actual_time_minutes: actualMinutes });
      setFeedbackSession(null);
      await api.reschedule({ user_id: user.userId });
      await loadPlans(user.userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit feedback');
    } finally {
      setLoading(false);
    }
  };

  const fetchModuleDetails = async (moduleId: string) => {
    const [content, units] = await Promise.all([api.getModuleContent(moduleId), api.getStudyUnits(moduleId)]);
    const totalMinutes = units.study_units.reduce((sum, unit) => sum + unit.estimated_minutes, 0);
    setModuleDetails((prev) => ({ ...prev, [moduleId]: { content, totalMinutes } }));
  };

  const handleUpload = async () => {
    const module = modules.find((item) => item.id === uploadForm.moduleId);
    if (!module) return;
    setLoading(true);
    setError(null);
    try {
      await api.uploadContent({
        user_id: user.userId,
        module_id: module.id,
        module_name: module.name,
        module_type: module.module_type,
        pasted_text: uploadForm.pastedText || undefined,
        file: uploadForm.file,
      });
      await fetchModuleDetails(module.id);
      await loadPlans(user.userId);
      setUploadForm({ moduleId: module.id, pastedText: '', file: undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  const addAssessment = async (assessment: AssessmentForm) => {
    setLoading(true);
    setError(null);
    try {
      await api.addAssessment(assessment);
      setAssessments((prev) => [...prev, assessment]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save assessment');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOnboarded) return;
    void loadPlans(user.userId);
  }, [isOnboarded]);

  const nextSession = todaySessions.find((session) => session.status === 'planned');
  const completedToday = todaySessions.filter((session) => session.status === 'completed').length;
  const remainingMinutes = todaySessions
    .filter((session) => session.status !== 'completed')
    .reduce((sum, session) => sum + session.planned_minutes, 0);

  const moduleStats = useMemo(() => {
    return modules.map((module) => {
      const moduleSessions = weekSessions.filter((session) => session.module_id === module.id);
      const completed = moduleSessions.filter((session) => session.status === 'completed').length;
      const total = moduleSessions.length || 1;
      const planned = moduleSessions.reduce((sum, session) => sum + session.planned_minutes, 0);
      const done = moduleSessions.filter((session) => session.status === 'completed').reduce((sum, session) => sum + session.planned_minutes, 0);
      const nextDeadline = assessments
        .filter((assessment) => assessment.module_id === module.id)
        .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date;
      return {
        ...module,
        progress: Math.round((completed / total) * 100),
        remainingMinutes: Math.max(planned - done, 0),
        nextDeadline,
      };
    });
  }, [modules, weekSessions, assessments]);

  const weekStart = startOfWeek(new Date());
  const dayCount = calendarMode === 'week' ? 7 : 28;
  const days = Array.from({ length: dayCount }).map((_, index) => {
    const current = new Date(weekStart);
    current.setDate(weekStart.getDate() + index);
    const key = isoDate(current);
    const daySessions = weekSessions.filter((session) => session.session_date === key);
    const totalMinutes = daySessions.reduce((sum, session) => sum + session.planned_minutes, 0);
    return {
      date: key,
      totalMinutes,
      sessions: daySessions.length,
      deadlines: assessments
        .filter((assessment) => assessment.due_date === key)
        .map((assessment) => ({
          title: assessment.title,
          priority: assessment.weight >= 40 ? 'high' : assessment.weight >= 20 ? 'medium' : 'low',
        })) as Array<{ title: string; priority: 'low' | 'medium' | 'high' }>,
    };
  });

  if (!isOnboarded) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-md bg-app px-4 py-6">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-900">StudyPartner</h1>
          <p className="text-sm text-slate-500">Let’s set up your weekly plan.</p>
        </header>
        {error && <div className="mb-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</div>}

        {onboardingStep === 1 && (
          <OnboardingStep title="Weekly study time" subtitle="Choose how much time you can realistically commit each week.">
            <input
              type="range"
              min={2}
              max={30}
              value={onboarding.weeklyHours}
              onChange={(event) => setOnboarding((prev) => ({ ...prev, weeklyHours: Number(event.target.value) }))}
              className="w-full"
            />
            <p className="text-sm text-slate-700">{onboarding.weeklyHours} hours/week</p>
            <button className="btn-primary w-full" onClick={() => setOnboardingStep(2)}>Continue</button>
          </OnboardingStep>
        )}

        {onboardingStep === 2 && (
          <OnboardingStep title="Available windows" subtitle="Pick the times you can usually study.">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(onboarding.windows) as Array<keyof typeof onboarding.windows>).map((slot) => (
                <button
                  key={slot}
                  onClick={() => setOnboarding((prev) => ({ ...prev, windows: { ...prev.windows, [slot]: !prev.windows[slot] } }))}
                  className={`rounded-xl border px-3 py-2 text-sm ${onboarding.windows[slot] ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600'}`}
                >
                  {fmtSlot(slot)}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary w-full" onClick={() => setOnboardingStep(1)}>Back</button>
              <button className="btn-primary w-full" onClick={() => setOnboardingStep(3)}>Continue</button>
            </div>
          </OnboardingStep>
        )}

        {onboardingStep === 3 && (
          <OnboardingStep title="Select modules" subtitle="Add your current modules to start planning.">
            <ModuleCreator onAdd={(module) => setOnboarding((prev) => ({ ...prev, modules: [...prev.modules, module] }))} />
            <ul className="space-y-2 text-sm">
              {onboarding.modules.map((module) => (
                <li key={module.id} className="rounded-lg border border-slate-200 px-3 py-2 text-slate-700">{module.name}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button className="btn-secondary w-full" onClick={() => setOnboardingStep(2)}>Back</button>
              <button className="btn-primary w-full" disabled={loading || onboarding.modules.length === 0} onClick={saveOnboarding}>
                {loading ? 'Creating plan...' : 'Finish onboarding'}
              </button>
            </div>
          </OnboardingStep>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-md bg-app px-4 pb-24 pt-4">
      <header className="mb-4">
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString()}</p>
        <h1 className="text-2xl font-semibold text-slate-900">Hi {user.name}</h1>
      </header>
      {error && <div className="mb-3 rounded-xl bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</div>}

      {tab === 'dashboard' && (
        <section className="space-y-3">
          <article className="card space-y-2">
            <p className="text-sm text-slate-500">Remaining study time today</p>
            <p className="text-3xl font-semibold text-slate-900">{remainingMinutes} min</p>
          </article>
          <article className="card space-y-2">
            <p className="text-sm text-slate-500">Next session</p>
            <p className="font-semibold text-slate-900">{nextSession ? `${nextSession.module_id} · ${nextSession.unit_id}` : 'You are clear for today'}</p>
          </article>
          <article className="card space-y-3">
            <p className="text-sm text-slate-500">Progress summary</p>
            <ProgressBar value={todaySessions.length === 0 ? 0 : Math.round((completedToday / todaySessions.length) * 100)} />
            <p className="text-xs text-slate-500">{completedToday}/{todaySessions.length} sessions done today</p>
          </article>
          <article className="card">
            <p className="mb-2 text-sm text-slate-500">Upcoming assessments</p>
            <ul className="space-y-2 text-sm text-slate-700">
              {assessments.length === 0 ? <li>No deadlines yet.</li> : assessments.slice(0, 4).map((item) => <li key={item.id}>{item.title} · {prettyDate(item.due_date)}</li>)}
            </ul>
          </article>
        </section>
      )}

      {tab === 'today' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Today</h2>
            <button className="btn-secondary" onClick={() => api.reschedule({ user_id: user.userId }).then(() => loadPlans(user.userId))}>Reschedule</button>
          </div>
          {todaySessions.map((session, index) => {
            const derivedStatus = session.status === 'completed' ? 'completed' : activeSessions[session.id] ? 'in_progress' : 'not_started';
            return (
              <SessionCard
                key={session.id}
                session={session}
                moduleName={modules.find((module) => module.id === session.module_id)?.name ?? session.module_id}
                slot={fmtSlot(slotForIndex(index, onboarding.windows))}
                status={derivedStatus}
                onStart={() => handleStart(session.id)}
                onComplete={() => handleComplete(session)}
              />
            );
          })}
          {todaySessions.length === 0 && <article className="card text-sm text-slate-600">No sessions yet. Upload material to generate your plan.</article>}
        </section>
      )}

      {tab === 'week' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Week view</h2>
            <div className="flex gap-2">
              <button className={`btn-secondary ${calendarMode === 'week' ? '!border-brand-400 !text-brand-700' : ''}`} onClick={() => setCalendarMode('week')}>Week</button>
              <button className={`btn-secondary ${calendarMode === 'month' ? '!border-brand-400 !text-brand-700' : ''}`} onClick={() => setCalendarMode('month')}>Month</button>
            </div>
          </div>
          <WeeklyGrid days={days} mode={calendarMode} />
        </section>
      )}

      {tab === 'modules' && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Modules</h2>
          {moduleStats.map((module) => (
            <ModuleCard
              key={module.id}
              title={module.name}
              progress={module.progress}
              remainingMinutes={module.remainingMinutes}
              nextDeadline={module.nextDeadline}
            />
          ))}
        </section>
      )}

      {tab === 'upload' && (
        <UploadSection
          modules={modules}
          assessments={assessments}
          loading={loading}
          uploadForm={uploadForm}
          setUploadForm={setUploadForm}
          onUpload={handleUpload}
          onAssessment={addAssessment}
          details={moduleDetails[uploadForm.moduleId]}
        />
      )}

      <FeedbackModal
        open={Boolean(feedbackSession)}
        estimated={feedbackSession?.planned_minutes ?? 0}
        onClose={() => setFeedbackSession(null)}
        onSubmit={handleFeedbackSubmit}
      />

      <nav className="fixed bottom-0 left-0 right-0 mx-auto flex w-full max-w-md justify-around border-t border-slate-200 bg-white px-2 py-2">
        {[
          ['dashboard', 'Dashboard'],
          ['today', 'Today'],
          ['week', 'Week'],
          ['modules', 'Modules'],
          ['upload', 'Upload'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as Tab)} className={`rounded-lg px-3 py-2 text-xs ${tab === key ? 'bg-brand-100 text-brand-700' : 'text-slate-500'}`}>
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}

function ModuleCreator({ onAdd }: { onAdd: (module: ModuleForm) => void }) {
  const [draft, setDraft] = useState<ModuleForm>({ id: '', name: '', module_type: 'semester' });
  return (
    <div className="space-y-2">
      <input className="input" placeholder="Module id" value={draft.id} onChange={(event) => setDraft((prev) => ({ ...prev, id: event.target.value }))} />
      <input className="input" placeholder="Module name" value={draft.name} onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))} />
      <select className="input" value={draft.module_type} onChange={(event) => setDraft((prev) => ({ ...prev, module_type: event.target.value as 'year' | 'semester' }))}>
        <option value="semester">Semester</option>
        <option value="year">Year</option>
      </select>
      <button
        className="btn-secondary w-full"
        disabled={!draft.id || !draft.name}
        onClick={() => {
          onAdd(draft);
          setDraft({ id: '', name: '', module_type: 'semester' });
        }}
      >
        Add module
      </button>
    </div>
  );
}

function UploadSection({
  modules,
  loading,
  assessments,
  uploadForm,
  setUploadForm,
  onUpload,
  onAssessment,
  details,
}: {
  modules: ModuleForm[];
  loading: boolean;
  assessments: AssessmentForm[];
  uploadForm: { moduleId: string; pastedText: string; file?: File };
  setUploadForm: (value: { moduleId: string; pastedText: string; file?: File }) => void;
  onUpload: () => Promise<void>;
  onAssessment: (assessment: AssessmentForm) => Promise<void>;
  details?: { content?: ModuleContentResponse; totalMinutes: number };
}) {
  const [assessment, setAssessment] = useState<AssessmentForm>({ id: '', module_id: '', title: '', due_date: '', weight: 30 });

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-900">Upload</h2>
      <article className="card space-y-2">
        <select className="input" value={uploadForm.moduleId} onChange={(event) => setUploadForm({ ...uploadForm, moduleId: event.target.value })}>
          <option value="">Select module</option>
          {modules.map((module) => (
            <option key={module.id} value={module.id}>{module.name}</option>
          ))}
        </select>
        <textarea className="input min-h-28" placeholder="Paste study text" value={uploadForm.pastedText} onChange={(event) => setUploadForm({ ...uploadForm, pastedText: event.target.value })} />
        <input className="input" type="file" onChange={(event) => setUploadForm({ ...uploadForm, file: event.target.files?.[0] })} />
        <button className="btn-primary w-full" disabled={loading || !uploadForm.moduleId || (!uploadForm.pastedText && !uploadForm.file)} onClick={onUpload}>
          {loading ? 'Uploading…' : 'Upload study material'}
        </button>
      </article>

      <article className="card space-y-2">
        <h3 className="font-medium text-slate-800">Add assessment deadline</h3>
        <input className="input" placeholder="Assessment id" value={assessment.id} onChange={(event) => setAssessment((prev) => ({ ...prev, id: event.target.value }))} />
        <input className="input" placeholder="Title" value={assessment.title} onChange={(event) => setAssessment((prev) => ({ ...prev, title: event.target.value }))} />
        <input className="input" type="date" value={assessment.due_date} onChange={(event) => setAssessment((prev) => ({ ...prev, due_date: event.target.value }))} />
        <input className="input" type="number" value={assessment.weight} onChange={(event) => setAssessment((prev) => ({ ...prev, weight: Number(event.target.value) }))} />
        <button
          className="btn-secondary w-full"
          disabled={!assessment.id || !assessment.title || !assessment.due_date || !uploadForm.moduleId}
          onClick={() => onAssessment({ ...assessment, module_id: uploadForm.moduleId })}
        >
          Save assessment
        </button>
        <p className="text-xs text-slate-500">Saved deadlines: {assessments.length}</p>
      </article>

      {details?.content && (
        <article className="card space-y-2">
          <h3 className="font-medium text-slate-800">Parsed content</h3>
          <p className="text-sm text-slate-600">Topics: {details.content.topics.length}</p>
          <p className="text-sm text-slate-600">Estimated time: {details.totalMinutes} minutes</p>
        </article>
      )}
    </section>
  );
}
