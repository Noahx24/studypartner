export type Pace = 'slow' | 'normal' | 'fast';

export type SessionStatus = 'planned' | 'completed' | 'missed';

export type StudyWindowKey = 'morning' | 'lunch' | 'evening' | 'weekend';

export type UserSettings = {
  userId: string;
  name: string;
  email: string;
  hours_per_day: number;
  days_per_week: number;
  pace: Pace;
};

export type OnboardingData = {
  weeklyHours: number;
  windows: Record<StudyWindowKey, boolean>;
  modules: ModuleForm[];
};

export type ModuleForm = {
  id: string;
  name: string;
  module_type: 'year' | 'semester';
};

export type AssessmentForm = {
  id: string;
  module_id: string;
  title: string;
  due_date: string;
  weight: number;
};

export type StudySession = {
  id: string;
  user_id: string;
  module_id: string;
  unit_id: string;
  session_date: string;
  planned_minutes: number;
  status: SessionStatus;
};

export type WeeklySummary = {
  module_id: string;
  recommended_min_minutes: number;
  recommended_max_minutes: number;
  planned_minutes: number;
};

export type WeeklyPlanResponse = {
  week_start: string;
  week_end: string;
  sessions: StudySession[];
  summaries: WeeklySummary[];
  pace_feedback?: {
    multiplier: number;
    samples: number;
    message: string;
  };
};

export type DailyPlanResponse = {
  date: string;
  sessions: StudySession[];
};

export type ModuleContentResponse = {
  module_id: string;
  uploads: Array<{ filename: string; filepath: string; page_count: number | null; created_at: string }>;
  topics: Array<{ id: string; title: string; word_count: number; page_span: number | null }>;
};

export type StudyUnitsResponse = {
  module_id: string;
  study_units: Array<{
    id: string;
    topic_id: string;
    title: string;
    estimated_minutes: number;
    source_word_count: number;
    complexity_score: number;
    status: 'not_started' | 'in_progress' | 'completed';
  }>;
};
