import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './views/Dashboard';
import Modules from './views/Modules';
import UnitsEditor from './views/UnitsEditor';
import MoodleMaterials from './views/MoodleMaterials';
import MoodleCallback from './views/MoodleCallback';
import CalendarView from './views/CalendarView';
import StudyPlan from './views/StudyPlan';
import Profile from './views/Profile';
import Login from './views/Login';
import Onboarding, { ONBOARDED_KEY } from './views/Onboarding';
import PageNotFound from './lib/PageNotFound';

function isOnboarded(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(ONBOARDED_KEY) === userId;
  } catch {
    // localStorage disabled / private mode → don't block, just route
    // straight to the dashboard (and let the user re-onboard later).
    return true;
  }
}

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

const AuthenticatedApp = () => {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const location = useLocation();

  if (isLoadingAuth) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // First-run gate: send the user to the onboarding wizard until they
  // complete it. We allow /onboarding itself + the Moodle SSO callback
  // through (the latter is hit *during* onboarding when the student
  // chooses "Fetch from myModules"). Everything else redirects.
  const onboarded = isOnboarded(user?.id);
  const allowWithoutOnboarding =
    location.pathname.startsWith('/onboarding') ||
    location.pathname.startsWith('/moodle/callback');
  if (!onboarded && !allowWithoutOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Routes>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/modules" element={<Modules />} />
        <Route path="/modules/:moduleId/units" element={<UnitsEditor />} />
        <Route path="/modules/materials" element={<MoodleMaterials />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/plan" element={<StudyPlan />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="/moodle/callback" element={<MoodleCallback />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;
