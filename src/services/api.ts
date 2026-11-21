import type { SavedConversation, Session } from '../types';

const API_BASE = 'http://localhost:3001/api';

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
