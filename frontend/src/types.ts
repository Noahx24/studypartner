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

export type ModuleStructure = {
  module_id: string;
  learning_units: Array<{
    id: string;
    ordinal: number;
    topic: string;
    subtopics: Array<{
      id: string;
      ordinal: number;
      title: string;
      word_count: number;
      effort_score: number;
    }>;
  }>;
};

export type AIFeatureToggles = {
  summaries: boolean;
  subtopic_quiz: boolean;
  topic_quiz: boolean;
};

export type SelectionPayload = {
  user_id: string;
  module_id: string;
  subtopic_ids: string[];
  ai_features: AIFeatureToggles;
  low_data_mode: boolean;
};

export type PackStatus = 'not_generated' | 'generating' | 'generated' | 'failed';

export type PackStatusResponse = {
  id: string;
  module_id?: string;
  user_id?: string;
  selection_id?: string;
  status: PackStatus;
  byte_size: number | null;
  version: number;
  generated_at: string | null;
  error?: string | null;
};

export type PackPayload = {
  module_id: string;
  module_name: string;
  version: number;
  generated_at: string;
  low_data_mode: boolean;
  learning_units: Array<{
    id: string;
    ordinal: number;
    topic: string;
    topic_quiz: QuizPayload | null;
    subtopics: Array<{
      id: string;
      ordinal: number;
      title: string;
      word_count: number;
      effort_score: number;
      summary: SummaryPayload | null;
      quiz: QuizPayload | null;
    }>;
  }>;
  study_plan?: Array<{
    date: string;
    module_id: string;
    learning_unit_id: string;
    learning_unit_topic: string;
    subtopic_id: string;
    subtopic_title: string;
    planned_minutes: number;
    at_risk?: boolean;
  }>;
};

export type SummaryPayload = {
  key_concepts?: string[];
  bullets?: string[];
  simple_explanation?: string;
  raw?: string;
};

export type QuizPayload = {
  questions?: Array<
    | { type: 'mcq'; q: string; choices: string[]; answer: number; explain?: string }
    | { type: 'short'; q: string; answer: string }
  >;
  raw?: string;
};
