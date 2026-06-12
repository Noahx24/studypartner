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

import { getToken } from '../lib/tokenStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

function getAuthHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Timeouts stop the UI hanging indefinitely on a flaky connection and make
// offline states recoverable. Pack downloads are longer because they stream.
const DEFAULT_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 45_000;

class NetworkError extends Error {}
class TimeoutError extends Error {}

function friendlyError(err: unknown, path: string): Error {
  if (err instanceof TimeoutError) return new Error('Request timed out — check your connection.');
  if (err instanceof NetworkError) return new Error("Can't reach the server. You may be offline.");
  if (err instanceof Error) return err;
  return new Error(`Request failed for ${path}`);
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new TimeoutError();
    }
    // `fetch` throws TypeError on network failure
    if (err instanceof TypeError) throw new NetworkError(err.message);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE}${path}`,
      {
        headers: {
          ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...getAuthHeader(),
          ...init?.headers,
        },
        ...init,
      },
      DEFAULT_TIMEOUT_MS,
    );

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Request failed (${response.status})`);
    }
    // 204 No Content (and any zero-length 2xx response) has no body to
    // parse — caller gets undefined, which the `<T = void>` use sites
    // expect.
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  } catch (err) {
    throw friendlyError(err, path);
  }
};

const requestBytes = async (
  path: string,
): Promise<{ bytes: Uint8Array; etag: string | null }> => {
  try {
    const response = await fetchWithTimeout(`${API_BASE}${path}`, {}, DOWNLOAD_TIMEOUT_MS);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Request failed (${response.status})`);
    }
    const buf = await response.arrayBuffer();
    return { bytes: new Uint8Array(buf), etag: response.headers.get('ETag') };
  } catch (err) {
    throw friendlyError(err, path);
  }
};

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user_id: string }>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (payload: { name: string; email: string; password: string; hours_per_day?: number; days_per_week?: number; pace?: string }) =>
    request<{ token: string; user_id: string }>('/users/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMe: () => request<UserSettings & { id: string }>('/users/me'),

  updateMe: (payload: {
    name?: string;
    hours_per_day?: number;
    days_per_week?: number;
    pace?: string;
    custom_minutes_per_500_words?: number;
    max_daily_hours?: number;
  }) =>
    request<UserSettings & { id: string }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteAccount: () =>
    request<{ status: string; rows_removed: Record<string, number> }>('/users/me', {
      method: 'DELETE',
    }),

  getUser: (userId: string) => request<UserSettings & { id: string }>(`/users/${userId}`),

  listModules: () =>
    request<{
      modules: Array<{
        id: string;
        name: string;
        module_type: 'year' | 'semester';
        next_exam_date: string | null;
        next_assignment_date: string | null;
        assessments: Array<{ id: string; title: string; due_date: string; weight: number }>;
        unit_count: number;
        progress_percent: number;
      }>;
    }>('/modules'),

  deleteModule: (moduleId: string) =>
    request<void>(`/modules/${moduleId}`, { method: 'DELETE' }),

  createModule: (userId: string, module: ModuleForm) =>
    request<{ status: string; module_id: string }>('/modules', {
      method: 'POST',
      body: JSON.stringify({ ...module, user_id: userId }),
    }),

  updateOrCreateModule: (userId: string, module: ModuleForm) =>
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

  // ---- Unit editor (CRUD on parsed Learning Units + Subtopics) ----
  // Every mutation logs a parsing_feedback row server-side; future AI
  // runs on the same module fold the user's corrections into the prompt.
  createLearningUnit: (moduleId: string, payload: { topic: string }) =>
    request<{ id: string; ordinal: number; topic: string }>(
      `/modules/${moduleId}/learning-units`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  updateLearningUnit: (unitId: string, payload: { topic?: string; ordinal?: number }) =>
    request<{ id: string; ordinal: number; topic: string }>(
      `/learning-units/${unitId}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    ),
  deleteLearningUnit: (unitId: string) =>
    request<void>(`/learning-units/${unitId}`, { method: 'DELETE' }),

  getSubtopic: (subtopicId: string) =>
    request<{
      id: string;
      learning_unit_id: string;
      ordinal: number;
      title: string;
      content: string;
      word_count: number;
      effort_score: number;
    }>(`/subtopics/${subtopicId}`),

  createSubtopic: (unitId: string, payload: { title: string; content?: string }) =>
    request<{ id: string; learning_unit_id: string; ordinal: number; title: string; word_count: number; effort_score: number }>(
      `/learning-units/${unitId}/subtopics`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),
  updateSubtopic: (
    subtopicId: string,
    payload: { title?: string; content?: string; ordinal?: number },
  ) =>
    request<{ id: string; learning_unit_id: string; ordinal: number; title: string; word_count: number; effort_score: number }>(
      `/subtopics/${subtopicId}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
    ),
  deleteSubtopic: (subtopicId: string) =>
    request<void>(`/subtopics/${subtopicId}`, { method: 'DELETE' }),

  listParsingFeedback: (moduleId: string) =>
    request<{
      feedback: Array<{
        id: number;
        kind: string;
        target_id: string | null;
        before: unknown;
        after: unknown;
        created_at: string;
      }>;
    }>(`/modules/${moduleId}/parsing-feedback`),

  generatePlan: (userId: string) =>
    request<WeeklyPlanResponse>('/plans/generate', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, start_date: isoDate(startOfWeek(new Date())) }),
    }),

  getDailyPlan: (userId: string, forDate = isoDate(new Date())) =>
    request<DailyPlanResponse>(`/plans/daily/${userId}/${forDate}`),

  getSessionsRange: (userId: string, start: string, end: string) =>
    request<DailyPlanResponse & { start: string; end: string }>(
      `/plans/range/${userId}?start=${start}&end=${end}`,
    ),

  listAssessments: () =>
    request<{
      assessments: Array<{
        id: string;
        module_id: string;
        module_name: string;
        title: string;
        due_date: string;
        kind: string;
        status: string;
      }>;
    }>('/assessments'),

  completeSession: (sessionId: string) =>
    request<{ status: string; session_id: string }>(`/plans/sessions/${sessionId}/complete`, { method: 'POST' }),

  skipSession: (sessionId: string) =>
    request<{ status: string; session_id: string }>(`/plans/sessions/${sessionId}/skip`, { method: 'POST' }),

  getCatchUp: (userId: string) =>
    request<{
      count: number;
      minutes_to_recover: number;
      sessions: DailyPlanResponse['sessions'];
    }>(`/plans/catch-up/${userId}`),

  getPacing: (userId: string) =>
    request<{
      multiplier: number;
      samples: number;
      planned_minutes: number;
      actual_minutes: number;
      per_module: Array<{ module_id: string; module_name: string; ratio: number; samples: number }>;
      consistency: Array<{ date: string; completed: number; missed: number; planned: number }>;
    }>(`/plans/pacing/${userId}`),

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

  // --- Moodle (mobile-launch flow only — no manual token paste) ---
  moodleLaunch: (payload: { urlscheme: string; base_url?: string }) =>
    request<{ launch_url: string; passport: string }>('/moodle/launch', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  moodleLaunchCallback: (payload: { passport: string; token: string }) =>
    request<{ user_id: string; sitename: string; moodle_user_id: number }>(
      '/moodle/launch/callback',
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  moodleSync: () =>
    request<{
      modules_synced: number;
      assessments_synced: number;
      warnings: string[];
      last_sync: string;
    }>('/moodle/sync', { method: 'POST', body: '{}' }),

  moodleIcsImport: (payload: { user_id: string; ics_text: string }) =>
    request<{ events_imported: number }>('/moodle/ics/import', { method: 'POST', body: JSON.stringify(payload) }),

  listMaterials: () =>
    request<{
      resources: Array<{
        id: string;
        module_id: string;
        module_name: string;
        title: string;
        type: string;
        file_size: number | null;
        url: string | null;
        included_in_ai: boolean;
        ingested_at: string | null;
      }>;
    }>('/moodle/materials'),

  selectMaterials: (payload: { include?: string[]; exclude?: string[] }) =>
    request<{ included: number; excluded: number }>('/moodle/materials/select', {
      method: 'POST',
      body: JSON.stringify({ include: payload.include ?? [], exclude: payload.exclude ?? [] }),
    }),

  ingestSelectedMaterials: () =>
    request<{ ingested: string[]; skipped: { id: string; reason: string }[]; count: number }>(
      '/moodle/materials/ingest',
      { method: 'POST', body: '{}' },
    ),

  // --- Sync ---
  sync: (payload: { user_id: string; ops: unknown[]; last_pulled_at?: string }) =>
    request<{
      applied: string[];
      conflicts: { op_id: string | null; reason?: string }[];
      changes_since: Array<{ op_id: string; entity: string; entity_id: string; op: string; payload: unknown; applied_at: string }>;
      now: string;
    }>('/sync', { method: 'POST', body: JSON.stringify(payload) }),
};
