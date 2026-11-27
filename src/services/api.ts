import type {
  SavedConversation,
  Session,
  SessionPage,
  SessionQuery,
  ProgressStats,
  TrainingMode
} from '../types';
import { authHeaders, clearPasscode, UNAUTHORIZED_EVENT } from './auth';

// In dev the Vite page runs on :5173 and the API on :3001, so use an absolute
// URL. In a production build the Express server serves the page itself, so a
// relative /api path works on any host/port without recompiling.
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

const EMPTY_PAGE: SessionPage = { items: [], total: 0, page: 1, pageSize: 10, pageCount: 1 };
const EMPTY_STATS: ProgressStats = {
  summary: { total: 0, average: 0, best: 0, recent: 0 },
  trend: [],
  averages: {},
  comparisons: []
};

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...options?.headers }
    });
    if (response.status === 401) {
      clearPasscode();
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
      return null;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`API request failed: ${path}`, error);
    return null;
  }
}

function buildQuery(query: SessionQuery): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });
  const result = params.toString();
  return result ? `?${result}` : '';
}

export const api = {
  getAuthStatus: () => request<{ enabled: boolean }>('/auth-status').then((s) => s ?? { enabled: false }),

  getSessions: (query: SessionQuery = {}) =>
    request<SessionPage>(`/sessions${buildQuery(query)}`).then((page) => page ?? EMPTY_PAGE),

  getSession: (id: string) =>
    request<Session>(`/sessions/${encodeURIComponent(id)}`),

  getLatestSessions: () =>
    request<Partial<Record<TrainingMode, Session>>>('/sessions/latest').then((result) => result ?? {}),

  getProgressStats: () =>
    request<ProgressStats>('/sessions/stats').then((stats) => stats ?? EMPTY_STATS),

  uploadRecording: async (sessionId: string, blob: Blob) => {
    const result = await request<{ success: boolean; url: string }>(
      `/recordings/${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'video/webm' },
        body: blob
      }
    );
    return result?.url ?? null;
  },

  deleteSession: async (sessionId: string) => {
    const result = await request<{ success: boolean }>(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE'
    });
    return !!result?.success;
  },

  deleteSessions: async (sessionIds: string[]) => {
    const result = await request<{ success: boolean; deleted: number }>('/sessions/delete-bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: sessionIds })
    });
    return result?.deleted ?? 0;
  },

  getStorage: () =>
    request<{ bytes: number; count: number; retentionDays: number }>('/storage').then(
      (info) => info ?? { bytes: 0, count: 0, retentionDays: 0 }
    ),

  cleanupRecordings: async () => {
    const result = await request<{ success: boolean; removed: number }>('/recordings/cleanup', {
      method: 'POST'
    });
    return result?.removed ?? 0;
  },

  saveSession: async (session: Session) => {
    const result = await request<{ success: boolean }>('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session)
    });
    return !!result?.success;
  },

  getConversations: () =>
    request<SavedConversation[]>('/conversations').then((conversations) => conversations ?? []),

  saveConversation: async (conversation: SavedConversation) => {
    const result = await request<{ success: boolean }>('/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(conversation)
    });
    return !!result?.success;
  },

  deleteConversation: async (conversationId: string) => {
    const result = await request<{ success: boolean }>(`/conversations/${conversationId}`, {
      method: 'DELETE'
    });
    return !!result?.success;
  }
};
