import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';

import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { useMoodleDeepLink } from '@/lib/useMoodleDeepLink';
import { useResetPasswordDeepLink } from '@/lib/useResetPasswordDeepLink';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineBanner from '@/components/OfflineBanner';

// Route-level code splitting. The hero route (Dashboard) loads quickly;
// less-frequent views (UnitsEditor, MoodleMaterials, StudyPlan) defer
// their bundles until the user navigates there. Cuts initial bundle
// from 628KB to roughly 200KB on cold start.
const AppLayout = lazy(() => import('./components/layout/AppLayout'));
const Dashboard = lazy(() => import('./views/Dashboard'));
const Modules = lazy(() => import('./views/Modules'));
const UnitsEditor = lazy(() => import('./views/UnitsEditor'));
const MoodleMaterials = lazy(() => import('./views/MoodleMaterials'));
const CalendarView = lazy(() => import('./views/CalendarView'));
const StudyPlan = lazy(() => import('./views/StudyPlan'));
const Profile = lazy(() => import('./views/Profile'));
const Login = lazy(() => import('./views/Login'));
const ForgotPassword = lazy(() => import('./views/ForgotPassword'));
const ResetPassword = lazy(() => import('./views/ResetPassword'));
const Onboarding = lazy(() => import('./views/Onboarding'));
const CatchUp = lazy(() => import('./views/CatchUp'));
const Pacing = lazy(() => import('./views/Pacing'));
const PageNotFound = lazy(() => import('./lib/PageNotFound'));

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

// Always mounted (every route, logged in or out) so the password-reset
// deep link is caught even when the user is signed out on /login.
const GlobalDeepLinks = () => {
  useResetPasswordDeepLink();
  return null;
};

const AuthenticatedApp = () => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  // Listens for Moodle's studypartner:// deep-link redirect. No-op on web.
  useMoodleDeepLink();

  if (isLoadingAuth) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <Routes>
      {/* Fullscreen, outside the tab-bar layout: first-run setup */}
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/modules" element={<Modules />} />
        <Route path="/modules/:moduleId/units" element={<UnitsEditor />} />
        <Route path="/modules/materials" element={<MoodleMaterials />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/plan" element={<StudyPlan />} />
        <Route path="/catch-up" element={<CatchUp />} />
        <Route path="/pacing" element={<Pacing />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <OfflineBanner />
            <GlobalDeepLinks />
            <Suspense fallback={<Spinner />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/*" element={<AuthenticatedApp />} />
              </Routes>
            </Suspense>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
