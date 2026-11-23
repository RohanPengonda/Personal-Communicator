import type {
  TrainingMode,
  CommunicationMetrics,
  SessionReplayMarker,
  WhyCoachingCard,
  SessionDelta,
  Session,
  WordTiming
} from '../types';
import { API_BASE } from './api';

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
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
  const score = Math.max(1, Math.min(10, 7.5 - fillerCount * 0.3));
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
      speakingPaceWPM: input.durationSeconds ? Math.round((wordCount / input.durationSeconds) * 60) : 135,
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
