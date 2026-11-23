import type { SavedConversation, Session, TranscriptionResult } from '../types';

// In dev the Vite page runs on :5173 and the API on :3001, so use an absolute
// URL. In a production build the Express server serves the page itself, so a
// relative /api path works on any host/port without recompiling.
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:3001/api' : '/api');

async function request<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, options);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn(`API request failed: ${path}`, error);
    return null;
  }
}

export const api = {
  getSessions: () => request<Session[]>('/sessions').then((sessions) => sessions ?? []),

  transcribeAudio: async (blob: Blob) => {
    const result = await request<TranscriptionResult>('/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob
    });
    if (!result) throw new Error('Local transcription unavailable');
    return result;
  },

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
