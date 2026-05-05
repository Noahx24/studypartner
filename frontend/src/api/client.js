import { isoDate, startOfWeek } from '../utils/date';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const TOKEN_KEY = 'studypartner.auth_token';
// Timeouts stop the UI hanging indefinitely on a flaky connection and make
// offline states recoverable. Pack downloads are longer because they stream.
const DEFAULT_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 45_000;
class NetworkError extends Error {
}
class TimeoutError extends Error {
}
class AuthRequiredError extends Error {
    constructor() {
        super('Sign in required');
    }
}
export const auth = {
    get token() {
        try {
            return localStorage.getItem(TOKEN_KEY);
        }
        catch {
            return null;
        }
    },
    set(token) {
        try {
            if (token)
                localStorage.setItem(TOKEN_KEY, token);
            else
                localStorage.removeItem(TOKEN_KEY);
        }
        catch {
            /* private mode / disabled storage */
        }
    },
    clear() {
        auth.set(null);
    },
};
function friendlyError(err, path) {
    if (err instanceof AuthRequiredError)
        return err;
    if (err instanceof TimeoutError)
        return new Error('Request timed out — check your connection.');
    if (err instanceof NetworkError)
        return new Error("Can't reach the server. You may be offline.");
    if (err instanceof Error)
        return err;
    return new Error(`Request failed for ${path}`);
}
async function fetchWithTimeout(input, init, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: ctrl.signal });
    }
    catch (err) {
        if (err.name === 'AbortError') {
            throw new TimeoutError();
        }
        // `fetch` throws TypeError on network failure
        if (err instanceof TypeError)
            throw new NetworkError(err.message);
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
const request = async (path, init) => {
    try {
        const headers = {
            ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
            ...init?.headers,
        };
        const tok = auth.token;
        if (tok && !headers.Authorization)
            headers.Authorization = `Bearer ${tok}`;
        const response = await fetchWithTimeout(`${API_BASE}${path}`, {
            ...init,
            headers,
        }, DEFAULT_TIMEOUT_MS);
        if (response.status === 401) {
            auth.clear();
            throw new AuthRequiredError();
        }
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(text || `Request failed (${response.status})`);
        }
        return (await response.json());
    }
    catch (err) {
        throw friendlyError(err, path);
    }
};
const requestBytes = async (path) => {
    try {
        const response = await fetchWithTimeout(`${API_BASE}${path}`, {}, DOWNLOAD_TIMEOUT_MS);
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(text || `Request failed (${response.status})`);
        }
        const buf = await response.arrayBuffer();
        return { bytes: new Uint8Array(buf), etag: response.headers.get('ETag') };
    }
    catch (err) {
        throw friendlyError(err, path);
    }
};
export const api = {
    createUser: (payload) => request('/users', {
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
    getUser: (userId) => request(`/users/${userId}`),
    updateUser: (userId, patch) => request(`/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
            name: patch.name,
            email: patch.email,
            hours_per_day: patch.hours_per_day,
            days_per_week: patch.days_per_week,
            pace: patch.pace,
        }),
    }),
    createModule: (userId, module) => request('/modules', {
        method: 'POST',
        body: JSON.stringify({ ...module, user_id: userId }),
    }),
    updateOrCreateModule: (userId, module) => request('/modules', {
        method: 'POST',
        body: JSON.stringify({ ...module, user_id: userId }),
    }),
    addAssessment: (assessment) => request('/assessments', {
        method: 'POST',
        body: JSON.stringify(assessment),
    }),
    uploadContent: (payload) => {
        const form = new FormData();
        form.append('user_id', payload.user_id);
        form.append('module_id', payload.module_id);
        form.append('module_name', payload.module_name);
        form.append('module_type', payload.module_type);
        if (payload.pasted_text)
            form.append('pasted_text', payload.pasted_text);
        if (payload.file)
            form.append('file', payload.file);
        return request('/upload', { method: 'POST', body: form });
    },
    getModuleContent: (moduleId) => request(`/modules/${moduleId}/content`),
    getStudyUnits: (moduleId) => request(`/modules/${moduleId}/study-units`),
    getModuleStructure: (moduleId) => request(`/modules/${moduleId}/structure`),
    generatePlan: (userId) => request('/plans/generate', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, start_date: isoDate(startOfWeek(new Date())) }),
    }),
    getDailyPlan: (userId, forDate = isoDate(new Date())) => request(`/plans/daily/${userId}/${forDate}`),
    completeSession: (sessionId) => request(`/plans/sessions/${sessionId}/complete`, { method: 'POST' }),
    submitFeedback: (payload) => request('/plans/session/feedback', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    reschedule: (payload) => request('/plans/reschedule', {
        method: 'POST',
        body: JSON.stringify({ user_id: payload.user_id, from_date: payload.from_date ?? isoDate(new Date()) }),
    }),
    // --- Selection ---
    saveSelection: (payload) => request('/selection', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    getLatestSelection: (user_id, module_id) => request(`/selection/latest/${user_id}/${module_id}`),
    // --- Packs ---
    generatePack: (payload) => request('/pack/generate', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    getPackStatus: (pack_id) => request(`/pack/${pack_id}`),
    downloadPackBytes: (pack_id) => requestBytes(`/pack/${pack_id}/download`),
    listPacks: (module_id, user_id) => request(`/pack/module/${module_id}/${user_id}`),
    regeneratePack: (pack_id, payload) => request(`/pack/${pack_id}/regenerate`, {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    // --- AI preview ---
    aiPreview: (payload) => request('/ai/preview', {
        method: 'POST',
        body: JSON.stringify(payload),
    }),
    // --- Moodle ---
    // user_id is no longer sent — the backend reads it from the bearer token.
    moodleConnect: ({ base_url, token }) => request('/moodle/connect', {
        method: 'POST',
        body: JSON.stringify({ base_url, token }),
    }),
    moodleSync: () => request('/moodle/sync', { method: 'POST', body: '{}' }),
    moodleIcsImport: ({ ics_text }) => request('/moodle/ics/import', { method: 'POST', body: JSON.stringify({ ics_text }) }),
    listMaterials: () => request('/moodle/materials'),
    selectMaterials: ({ include = [], exclude = [] }) => request('/moodle/materials/select', {
        method: 'POST',
        body: JSON.stringify({ include, exclude }),
    }),
    ingestSelectedMaterials: () => request('/moodle/materials/ingest', { method: 'POST', body: '{}' }),
    // --- Auth (Microsoft) ---
    authStart: () => request('/auth/microsoft/start'),
    authMe: () => request('/auth/me'),
    authLogout: () => request('/auth/logout', { method: 'POST' }),
    authDevSignIn: ({ email, name }) => request('/auth/microsoft/dev', {
        method: 'POST',
        body: JSON.stringify({ email, name }),
    }),
    // --- Sync ---
    sync: (payload) => request('/sync', { method: 'POST', body: JSON.stringify(payload) }),
};
