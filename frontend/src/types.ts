export type Pace = 'slow' | 'normal' | 'fast';

export type SessionStatus = 'planned' | 'completed' | 'missed';

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
};

export type DailyPlanResponse = {
  date: string;
  sessions: StudySession[];
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

export type UserSettings = {
  userId: string;
  name: string;
  email: string;
  hours_per_day: number;
  days_per_week: number;
  pace: Pace;
};
