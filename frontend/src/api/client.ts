import type {
  AssessmentForm,
  DailyPlanResponse,
  ModuleContentResponse,
  ModuleForm,
  ModuleStructure,
  PackStatusResponse,
  SelectionPayload,
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

const requestBytes = async (path: string): Promise<{ bytes: Uint8Array; etag: string | null }> => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed for ${path}`);
  }
  const buf = await response.arrayBuffer();
  return { bytes: new Uint8Array(buf), etag: response.headers.get('ETag') };
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

    return request<{
      module_id: string;
      filepath: string;
      page_count: number | null;
      learning_unit_count: number;
      subtopic_count: number;
      topic_count: number;
      unit_count: number;
    }>('/upload', { method: 'POST', body: form });
  },

  getModuleContent: (moduleId: string) => request<ModuleContentResponse>(`/modules/${moduleId}/content`),
  getStudyUnits: (moduleId: string) => request<StudyUnitsResponse>(`/modules/${moduleId}/study-units`),
  getModuleStructure: (moduleId: string) => request<ModuleStructure>(`/modules/${moduleId}/structure`),

  generatePlan: (userId: string) =>
    request<WeeklyPlanResponse>('/plans/generate', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, start_date: isoDate(startOfWeek(new Date())) }),
    }),

  getDailyPlan: (userId: string, forDate = isoDate(new Date())) =>
    request<DailyPlanResponse>(`/plans/daily/${userId}/${forDate}`),

  completeSession: (sessionId: string) =>
    request<{ status: string; session_id: string }>(`/plans/sessions/${sessionId}/complete`, { method: 'POST' }),

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

  // --- Selection ---
  saveSelection: (payload: SelectionPayload) =>
    request<{ selection_id: string; updated_at: string }>('/selection', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getLatestSelection: (user_id: string, module_id: string) =>
    request<{ id: string; subtopic_ids: string[]; ai_features: { summaries: boolean; subtopic_quiz: boolean; topic_quiz: boolean }; low_data_mode: boolean }>(
      `/selection/latest/${user_id}/${module_id}`,
    ),

  // --- Packs ---
  generatePack: (payload: { user_id: string; selection_id: string }) =>
    request<{ pack_id: string; status: string }>('/pack/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPackStatus: (pack_id: string) => request<PackStatusResponse>(`/pack/${pack_id}`),

  downloadPackBytes: (pack_id: string) => requestBytes(`/pack/${pack_id}/download`),

  listPacks: (module_id: string, user_id: string) =>
    request<{ packs: PackStatusResponse[] }>(`/pack/module/${module_id}/${user_id}`),

  regeneratePack: (pack_id: string, payload: { scope: 'summary' | 'subtopic_quiz' | 'topic_quiz'; ref_id: string }) =>
    request<{ pack_id: string; status: string }>(`/pack/${pack_id}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // --- AI preview ---
  aiPreview: (payload: { selection_id: string; scope: 'summary' | 'subtopic_quiz' | 'topic_quiz'; ref_id: string }) =>
    request<{ scope: string; ref_id: string; payload: unknown }>('/ai/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // --- Moodle ---
  moodleConnect: (payload: { user_id: string; base_url: string; token: string }) =>
    request<{ sitename: string; moodle_user_id: number }>('/moodle/connect', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  moodleSync: (user_id: string) =>
    request<{ modules_synced: number; assessments_synced: number; last_sync: string }>('/moodle/sync', {
      method: 'POST',
      body: JSON.stringify({ user_id }),
    }),

  moodleIcsImport: (payload: { user_id: string; ics_text: string }) =>
    request<{ events_imported: number }>('/moodle/ics/import', { method: 'POST', body: JSON.stringify(payload) }),

  // --- Sync ---
  sync: (payload: { user_id: string; ops: unknown[]; last_pulled_at?: string }) =>
    request<{
      applied: string[];
      conflicts: { op_id: string | null; reason?: string }[];
      changes_since: Array<{ op_id: string; entity: string; entity_id: string; op: string; payload: unknown; applied_at: string }>;
      now: string;
    }>('/sync', { method: 'POST', body: JSON.stringify(payload) }),
};
