import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, auth } from './api/client';
import { runSync } from './api/sync';
import { useOutboxCount } from './hooks/useOutboxCount';
import { P } from './ui/tokens';
import { TabBar } from './ui/TabBar';
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
import { LoginView } from './views/LoginView';
import { MaterialsView } from './views/MaterialsView';
import { SettingsView } from './views/SettingsView';
import { FeedbackModal } from './components/FeedbackModal';
import { isoDate, startOfWeek } from './utils/date';

const TAB_FOR_ROUTE = {
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
    settings: 'home',
    materials: 'modules',
};

const ONBOARDED_KEY = 'studypartner.onboarded';

/**
 * Map a backend user (`/auth/me`) to the local UserSettings shape the
 * legacy views expect. The backend uses `id`; the views use `userId`.
 */
function backendUserToSettings(u) {
    return {
        userId: u.id,
        name: u.name,
        email: u.email,
        hours_per_day: u.hours_per_day,
        days_per_week: u.days_per_week,
        pace: u.pace,
    };
}

export function App() {
    const [authState, setAuthState] = useState('loading'); // 'loading' | 'signedOut' | 'signedIn'
    const [user, setUser] = useState(null);
    const [isOnboarded, setIsOnboarded] = useState(false);

    const [route, setRoute] = useState({ name: 'home' });
    const [modules, setModules] = useState([]);
    const [assessments, setAssessments] = useState([]);
    const [weekSessions, setWeekSessions] = useState([]);
    const [todaySessions, setTodaySessions] = useState([]);
    const [moduleDetails, setModuleDetails] = useState({});
    const [feedbackSession, setFeedbackSession] = useState(null);
    const [syncState, setSyncState] = useState('online');
    const outboxCount = useOutboxCount();
    const [error, setError] = useState(null);
    const [activeSelectionId, setActiveSelectionId] = useState(null);
    const [settingsSaving, setSettingsSaving] = useState(false);

    const loadPlans = useCallback(async (userId) => {
        const [week, today] = await Promise.all([api.generatePlan(userId), api.getDailyPlan(userId)]);
        setWeekSessions(week.sessions);
        setTodaySessions(today.sessions);
    }, []);

    // -- Bootstrap auth on first load: if a token exists, ask /auth/me. --
    useEffect(() => {
        let cancelled = false;
        const isOAuthCallback = window.location.hash.includes('auth_token=');
        if (!auth.token && !isOAuthCallback) {
            setAuthState('signedOut');
            return;
        }
        if (isOAuthCallback) {
            // LoginView will pick up the token from the URL fragment, store
            // it, and call onSignedIn. Stay in 'signedOut' so it renders.
            setAuthState('signedOut');
            return;
        }
        api.authMe()
            .then((res) => {
                if (cancelled) return;
                setUser(backendUserToSettings(res.user));
                setIsOnboarded(localStorage.getItem(ONBOARDED_KEY) === res.user.id);
                setAuthState('signedIn');
            })
            .catch(() => {
                if (cancelled) return;
                auth.clear();
                setAuthState('signedOut');
            });
        return () => {
            cancelled = true;
        };
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
        if (!isOnboarded || !user) return;
        void loadPlans(user.userId).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load plan'));
    }, [isOnboarded, user, loadPlans]);

    const handleSignedIn = (backendUser) => {
        const next = backendUserToSettings(backendUser);
        setUser(next);
        setAuthState('signedIn');
        setIsOnboarded(localStorage.getItem(ONBOARDED_KEY) === backendUser.id);
    };

    const handleSignOut = async () => {
        try {
            await api.authLogout();
        } catch {
            /* ignore */
        }
        auth.clear();
        setUser(null);
        setIsOnboarded(false);
        setAuthState('signedOut');
        setRoute({ name: 'home' });
    };

    const completeOnboarding = async (data) => {
        const days = Math.min(7, Math.max(3, Object.values(data.windows).filter(Boolean).length + 2));
        const nextUser = {
            ...user,
            hours_per_day: Number((data.weeklyHours / days).toFixed(1)),
            days_per_week: days,
        };
        // The user already exists (we created them at sign-in); patch availability.
        await api.updateUser(user.userId, {
            hours_per_day: nextUser.hours_per_day,
            days_per_week: nextUser.days_per_week,
            pace: nextUser.pace,
        });
        await Promise.all(data.modules.map((m) => api.createModule(nextUser.userId, m)));
        setUser(nextUser);
        setModules(data.modules);
        try {
            localStorage.setItem(ONBOARDED_KEY, user.userId);
        } catch {
            /* ignore */
        }
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

    const handleComplete = async (session) => {
        try {
            await api.completeSession(session.id);
            setFeedbackSession(session);
            await loadPlans(user.userId);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to complete session');
        }
    };

    const handleFeedbackSubmit = async (actualMinutes) => {
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

    const handleSaveSettings = async (next) => {
        setSettingsSaving(true);
        try {
            await api.updateUser(user.userId, {
                name: next.name,
                email: next.email,
                hours_per_day: next.hours_per_day,
                days_per_week: next.days_per_week,
                pace: next.pace,
            });
            setUser(next);
            await loadPlans(user.userId);
            setRoute({ name: 'home' });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unable to save settings');
        } finally {
            setSettingsSaving(false);
        }
    };

    const fetchModuleDetails = useCallback(async (moduleId) => {
        const [content, units] = await Promise.all([
            api.getModuleContent(moduleId),
            api.getStudyUnits(moduleId),
        ]);
        const totalMinutes = units.study_units.reduce((sum, u) => sum + u.estimated_minutes, 0);
        setModuleDetails((prev) => ({ ...prev, [moduleId]: { content, totalMinutes } }));
    }, []);

    const addAssessment = async (a) => {
        await api.addAssessment(a);
        setAssessments((prev) => [...prev, a]);
    };

    const moduleById = useMemo(() => Object.fromEntries(modules.map((m) => [m.id, m])), [modules]);

    const navigateTab = (tab) => {
        const routeForTab = {
            home: { name: 'home' },
            today: { name: 'today' },
            week: { name: 'week' },
            calendar: { name: 'calendar' },
            modules: { name: 'modules' },
        };
        setRoute(routeForTab[tab]);
    };

    if (authState === 'loading') {
        return (
            <main className="mx-auto flex min-h-screen w-full max-w-[440px] items-center justify-center" style={{ background: P.bg }}>
                <span className="text-sm text-ink3">Loading…</span>
            </main>
        );
    }

    if (authState === 'signedOut') {
        return <LoginView onSignedIn={handleSignedIn} />;
    }

    if (!isOnboarded) {
        return <LandingView onDone={completeOnboarding} />;
    }

    const showTabs = route.name !== 'timer' && route.name !== 'reader';
    const currentTab = TAB_FOR_ROUTE[route.name];

    return (
        <main className="relative mx-auto min-h-screen w-full max-w-[440px]" style={{ background: P.bg }}>
            {error && (
                <div className="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold" style={{ background: P.coralSoft, color: P.coralDeep }}>
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
                    syncState={syncState === 'online' && outboxCount > 0 ? { queued: outboxCount } : syncState}
                    onSync={handleSync}
                    onStartSession={(s) => setRoute({ name: 'timer', session: s })}
                    onOpenModules={() => setRoute({ name: 'modules' })}
                    onOpenAssessments={() => setRoute({ name: 'assessments' })}
                    onOpenModule={(id) => {
                        void fetchModuleDetails(id);
                        setRoute({ name: 'module_detail', moduleId: id });
                    }}
                    onOpenSettings={() => setRoute({ name: 'settings' })}
                />
            )}

            {route.name === 'settings' && (
                <section className="px-4 pb-24 pt-12">
                    <button onClick={() => setRoute({ name: 'home' })} className="mb-4 text-sm font-semibold opacity-60">
                        ← Back
                    </button>
                    <SettingsView settings={user} loading={settingsSaving} onSave={handleSaveSettings} />
                    <button
                        onClick={handleSignOut}
                        className="mt-6 w-full rounded-card px-4 py-3 text-[14px] font-semibold"
                        style={{ background: P.surface, border: `1px solid ${P.line}`, color: P.coralDeep }}
                    >
                        Sign out
                    </button>
                </section>
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
                <WeekView modules={modules} weekSessions={weekSessions} assessments={assessments} />
            )}

            {route.name === 'calendar' && (
                <CalendarView modules={modules} weekSessions={weekSessions} assessments={assessments} onOpenAssessments={() => setRoute({ name: 'assessments' })} />
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
                    onOpenMaterials={() => setRoute({ name: 'materials' })}
                />
            )}

            {route.name === 'materials' && (
                <MaterialsView
                    onBack={() => setRoute({ name: 'modules' })}
                    onIngested={async () => {
                        await loadPlans(user.userId);
                    }}
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
                <AssessmentsView modules={modules} assessments={assessments} onBack={() => setRoute({ name: 'calendar' })} onAdd={addAssessment} />
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
                <PackReaderView pack_id={route.packId} payload={route.payload} onClose={() => setRoute({ name: 'modules' })} />
            )}

            <FeedbackModal open={Boolean(feedbackSession)} estimated={feedbackSession?.planned_minutes ?? 0} onClose={() => setFeedbackSession(null)} onSubmit={handleFeedbackSubmit} />

            {showTabs && <TabBar active={currentTab} onChange={navigateTab} />}

            {/* No-op reference to silence unused warnings in dev */}
            <div style={{ display: 'none' }}>{isoDate(startOfWeek(new Date()))}</div>
        </main>
    );
}
