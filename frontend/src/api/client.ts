import type { AssessmentForm, DailyPlanResponse, ModuleForm, UserSettings, WeeklyPlanResponse } from '../types';
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
  createUser: (payload: UserSettings) => request('/users', { method: 'POST', body: JSON.stringify({ ...payload, id: payload.userId }) }),

  updateOrCreateModule: (userId: string, module: ModuleForm) =>
    request('/modules', { method: 'POST', body: JSON.stringify({ ...module, user_id: userId }) }),

  addAssessment: (assessment: AssessmentForm) => request('/assessments', { method: 'POST', body: JSON.stringify(assessment) }),

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

    return request('/upload', { method: 'POST', body: form });
  },

  getWeekPlan: async (userId: string): Promise<WeeklyPlanResponse> => {
    const weekStart = isoDate(startOfWeek(new Date()));

    try {
      return await request('/plan/week');
    } catch {
      return request('/plans/generate', { method: 'POST', body: JSON.stringify({ user_id: userId, start_date: weekStart }) });
    }
  },

  getTodayPlan: async (userId: string): Promise<DailyPlanResponse> => {
    const today = isoDate(new Date());
    try {
      return await request('/plan/today');
    } catch {
      return request(`/plans/daily/${userId}/${today}`);
    }
  },

  completeSession: async (sessionId: string) => {
    try {
      return await request('/session/complete', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) });
    } catch {
      return request(`/plans/sessions/${sessionId}/complete`, { method: 'POST' });
    }
  },

  reschedule: async (userId: string) => {
    const today = isoDate(new Date());
    return request('/reschedule', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, from_date: today }),
    }).catch(() => request('/plans/reschedule', { method: 'POST', body: JSON.stringify({ user_id: userId, from_date: today }) }));
  },
};
