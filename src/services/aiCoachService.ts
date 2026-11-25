import type {
  TrainingMode,
  CommunicationMetrics,
  SessionReplayMarker,
  WhyCoachingCard,
  SessionDelta,
  Session,
  WordTiming,
  InterviewTurnInput,
  InterviewTurnResult,
  InterviewStartResult
} from '../types';
import { API_BASE } from './api';
import { authHeaders, clearPasscode, UNAUTHORIZED_EVENT } from './auth';

export interface EvaluationInput {
  mode: TrainingMode;
  contextPrompt: string;
  targetAudience?: string;
  transcript: string;
  durationSeconds: number;
  wordTimings?: WordTiming[];
  previousAttemptSession?: Session | null;
}

export interface EvaluationResult {
  score: number;
  metrics: CommunicationMetrics;
  replays: SessionReplayMarker[];
  whyCoaching: WhyCoachingCard[];
  deltas?: SessionDelta;
  oneThingToPractice: string;
  source: 'AI' | 'MOCK';
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(`Cannot reach the API server at ${API_BASE}. Start the server, then try again.`);
  }

  if (response.status === 401) {
    clearPasscode();
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new Error('Passcode required. Please unlock the app again.');
  }

  if (!response.ok) {
    let detail = '';
    try {
      const data = await response.json() as { error?: string };
      detail = data?.error || '';
    } catch {
      // Keep the HTTP status as the fallback message.
    }
    throw new Error(detail || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function evaluateSession(input: EvaluationInput): Promise<EvaluationResult> {
  try {
    return await post<EvaluationResult>('/evaluate', input);
  } catch (error) {
    console.warn('Evaluation API unavailable, using minimal local fallback:', error);
    return localFallback(input);
  }
}

export async function startInterview(input: {
  role: string;
  customQuestions: string[];
}): Promise<InterviewStartResult> {
  return post<InterviewStartResult>('/interview/start', input);
}

export async function answerInterview(input: InterviewTurnInput): Promise<InterviewTurnResult> {
  return post<InterviewTurnResult>('/interview/turn', input);
}

export async function generateConversationReply(
  transcript: string,
  history: { speaker: string; text: string }[]
): Promise<string> {
  try {
    const result = await post<{ reply: string }>('/conversation-reply', { transcript, history });
    return result.reply;
  } catch {
    return 'I understand. Could you tell me a little more about what happened and how you handled it?';
  }
}

function localFallback(input: EvaluationInput): EvaluationResult {
  const wordCount = input.transcript.split(/\s+/).filter(Boolean).length;
  const fillerCount = (input.transcript.match(/\b(um|uh|like|basically|you know)\b/gi) || []).length;
  const fillerRate = (fillerCount / Math.max(1, wordCount)) * 100;
  const wpm = input.durationSeconds ? Math.round((wordCount / input.durationSeconds) * 60) : 135;
  const round1 = (value: number) => Math.round(value * 10) / 10;
  const clamp = (value: number) => Math.max(1, Math.min(10, value));
  const score = round1(clamp(
    6.0 + Math.min(1.2, wordCount / 50) - Math.min(2.6, fillerRate * 1.1) - (wpm > 190 ? 1 : 0)
  ));
  const first = input.wordTimings?.[0]?.start ?? 0;
  const last = input.wordTimings?.[input.wordTimings.length - 1]?.end ?? input.durationSeconds;

  return {
    score,
    metrics: {
      overall: score,
      storytelling: score,
      clarity: score,
      engagement: score,
      confidence: score,
      wit: score,
      spontaneity: score,
      conciseness: score,
      structure: score,
      audienceAdaptation: score,
      explanationQuality: score,
      fillerWordsCount: fillerCount,
      speakingPaceWPM: wpm,
      responseRelevance: score
    },
    replays: [
      {
        id: 'local-1',
        timestampSeconds: Math.round(first),
        label: 'Opening',
        type: 'STRONG_OPENING',
        textSnippet: input.transcript.slice(0, 45),
        advice: 'Lead with the main point before adding background.'
      },
      {
        id: 'local-2',
        timestampSeconds: Math.round(last),
        label: 'Ending',
        type: 'STRONG_ENDING',
        textSnippet: input.transcript.slice(-45),
        advice: 'Finish with a single clear takeaway.'
      }
    ],
    whyCoaching: [],
    oneThingToPractice: 'State your main point first, then support it with one specific example.',
    source: 'MOCK'
  };
}
