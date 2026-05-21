import { Toaster } from 'sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClientInstance } from '@/lib/query-client';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { useMoodleDeepLink } from '@/lib/useMoodleDeepLink';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './views/Dashboard';
import Modules from './views/Modules';
import UnitsEditor from './views/UnitsEditor';
import MoodleMaterials from './views/MoodleMaterials';
import CalendarView from './views/CalendarView';
import StudyPlan from './views/StudyPlan';
import Profile from './views/Profile';
import Login from './views/Login';
import PageNotFound from './lib/PageNotFound';

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
  </div>
);

const AuthenticatedApp = () => {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  // Listens for Moodle's studypartner:// deep-link redirect. No-op on web.
  useMoodleDeepLink();

  if (isLoadingAuth) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/modules" element={<Modules />} />
        <Route path="/modules/:moduleId/units" element={<UnitsEditor />} />
        <Route path="/modules/materials" element={<MoodleMaterials />} />
        <Route path="/calendar" element={<CalendarView />} />
        <Route path="/plan" element={<StudyPlan />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
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
