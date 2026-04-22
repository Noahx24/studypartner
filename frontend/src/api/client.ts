import type {
  AssessmentForm,
  DailyPlanResponse,
  ModuleContentResponse,
  ModuleForm,
  StudyUnitsResponse,
  UserSettings,
  WeeklyPlanResponse,
} from '../types';
import { isoDate, startOfWeek } from '../utils/date';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed for ${path}`);
  }

  return response.json() as Promise<T>;
};

export const api = {
  createUser: (payload: UserSettings) =>
    request<{ status: string; user_id: string }>('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: payload.userId,
        name: payload.name,
        email: payload.email,
        hours_per_day: payload.hours_per_day,
        days_per_week: payload.days_per_week,
        pace: payload.pace,
      }),
    }),

  getUser: (userId: string) => request<UserSettings & { id: string }>(`/users/${userId}`),

  createModule: (userId: string, module: ModuleForm) =>
    request<{ status: string; module_id: string }>('/modules', {
      method: 'POST',
      body: JSON.stringify({ ...module, user_id: userId }),
    }),

  addAssessment: (assessment: AssessmentForm) =>
    request<{ status: string; assessment_id: string }>('/assessments', {
      method: 'POST',
      body: JSON.stringify(assessment),
    }),

  uploadContent: (payload: {
    user_id: string;
    module_id: string;
    module_name: string;
    module_type: 'year' | 'semester';
    pasted_text?: string;
    file?: File;
  }) => {
    const form = new FormData();
    form.append('user_id', payload.user_id);
    form.append('module_id', payload.module_id);
    form.append('module_name', payload.module_name);
    form.append('module_type', payload.module_type);
    if (payload.pasted_text) form.append('pasted_text', payload.pasted_text);
    if (payload.file) form.append('file', payload.file);

    return request<{ topics?: unknown[]; total_estimated_minutes?: number }>('/upload', { method: 'POST', body: form });
  },

  getModuleContent: (moduleId: string) => request<ModuleContentResponse>(`/modules/${moduleId}/content`),

  getStudyUnits: (moduleId: string) => request<StudyUnitsResponse>(`/modules/${moduleId}/study-units`),

  generatePlan: (userId: string) =>
    request<WeeklyPlanResponse>('/plans/generate', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, start_date: isoDate(startOfWeek(new Date())) }),
    }),

  getDailyPlan: (userId: string, forDate = isoDate(new Date())) => request<DailyPlanResponse>(`/plans/daily/${userId}/${forDate}`),

  completeSession: (sessionId: string) => request<{ status: string; session_id: string }>(`/plans/sessions/${sessionId}/complete`, { method: 'POST' }),

  submitFeedback: (payload: { user_id: string; session_id: string; actual_time_minutes: number }) =>
    request<{ multiplier: number; samples: number; status: string }>('/plans/session/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  reschedule: (payload: { user_id: string; from_date?: string }) =>
    request<WeeklyPlanResponse>('/plans/reschedule', {
      method: 'POST',
      body: JSON.stringify({ user_id: payload.user_id, from_date: payload.from_date ?? isoDate(new Date()) }),
    }),
};
