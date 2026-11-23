import { GoogleGenAI } from '@google/genai';
import type {
  CommunicationMetrics,
  SessionReplayMarker,
  WhyCoachingCard,
  SessionDelta,
  Session,
  WordTiming
} from '../src/types/index.ts';

// Server-side key: never exposed to the browser bundle.
const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export interface EvaluationInput {
  mode: 'LIVE_COACH' | 'CONVERSATION' | 'INTERVIEW';
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

const normalize = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

const FILLER = /^(um|uh|like|basically|you\s+know|sort\s+of|kind\s+of|i\s+mean|honestly)$/i;

// Map coaching markers onto real word timings from local S2T when available.
function alignReplays(markers: SessionReplayMarker[], transcript: string, timings: WordTiming[]) {
  if (!timings.length) return markers;

  const text = normalize(transcript);
  let cursor = 0;
  const wordOffsets = timings.map((timing, index) => {
    const found = text.indexOf(normalize(timing.word), cursor);
    const startChar = found >= 0 ? found : cursor;
    cursor = startChar + normalize(timing.word).length;
    return { startChar, endChar: cursor, index };
  });

  return markers.map((marker) => {
    if (marker.type === 'FILLER_SPIKE') {
      const filler = timings.find((timing) => FILLER.test(timing.word.trim()));
      if (filler) {
        return { ...marker, timestampSeconds: Math.round(filler.start), textSnippet: filler.word };
      }
    }
    if (marker.type === 'STRONG_ENDING') {
      return { ...marker, timestampSeconds: Math.round(timings[timings.length - 1].end) };
    }

    const snippet = normalize(marker.textSnippet).replace(/\.\.\.$/, '').trim();
    if (!snippet) return marker;
    const position = text.indexOf(snippet.slice(0, Math.min(60, snippet.length)));
    if (position < 0) return marker;
    const hit = wordOffsets.find((word) => position >= word.startChar && position < word.endChar);
    if (!hit) return marker;
    return { ...marker, timestampSeconds: Math.round(timings[hit.index].start) };
  });
}

export async function evaluateSession(input: EvaluationInput): Promise<EvaluationResult> {
  let result: EvaluationResult;
  if (ai) {
    try {
      result = await evaluateWithGemini(input);
    } catch (error) {
      console.warn('Gemini evaluation failed, using local mock engine:', (error as Error).message);
      result = generateIntelligentMockEvaluation(input);
    }
  } else {
    result = generateIntelligentMockEvaluation(input);
  }

  return { ...result, replays: alignReplays(result.replays, input.transcript, input.wordTimings ?? []) };
}

async function evaluateWithGemini(input: EvaluationInput): Promise<EvaluationResult> {
  const prompt = `
You are a world-class long-term Personal AI Communication Coach.
Evaluate this user communication session with high standards (brutally honest + supportive).

Session Mode: ${input.mode}
Context / Prompt: ${input.contextPrompt}
Target Audience: ${input.targetAudience || 'General'}
Duration (seconds): ${input.durationSeconds}
Transcript: "${input.transcript}"

Return ONLY a raw JSON object with this exact structure:
{
  "score": 7.4,
  "metrics": {
    "overall": 7.4,
    "storytelling": 7.5,
    "clarity": 8.0,
    "engagement": 7.2,
    "confidence": 7.0,
    "wit": 6.5,
    "spontaneity": 7.5,
    "conciseness": 7.8,
    "structure": 7.9,
    "audienceAdaptation": 7.6,
    "explanationQuality": 8.0,
    "fillerWordsCount": 3,
    "speakingPaceWPM": 142,
    "responseRelevance": 8.8
  },
  "replays": [
    {
      "id": "m1",
      "timestampSeconds": 10,
      "label": "Strong Opening Hook",
      "type": "STRONG_OPENING",
      "textSnippet": "exact snippet",
      "advice": "actionable tip"
    }
  ],
  "whyCoaching": [
    {
      "id": "w1",
      "category": "COMMUNICATION",
      "observation": "What happened in user transcript",
      "impact": "Why it hurt engagement",
      "principle": "Underlying communication principle",
      "exemplarReframing": "Better way to phrase it"
    }
  ],
  "oneThingToPractice": "Clear single takeaway focus"
}
`;

  const response = await ai!.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt
  });
  const text = response.text || '';
  const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleanJson);

  if (input.previousAttemptSession) {
    parsed.deltas = calculateDeltas(parsed, input.previousAttemptSession);
  }
  return { ...parsed, source: 'AI' as const };
}

function generateIntelligentMockEvaluation(input: EvaluationInput): EvaluationResult {
  const transcript = input.transcript || '';
  const wordCount = transcript.split(/\s+/).filter(Boolean).length;
  const fillerRegex = /\b(um|uh|like|basically|you know|sort of|kind of|i mean|honestly)\b/gi;
  const fillerCount = (transcript.match(fillerRegex) || []).length;
  const wpm = input.durationSeconds > 0 ? Math.round((wordCount / input.durationSeconds) * 60) : 135;

  let storytelling = 7.2;
  let clarity = 7.8;
  let engagement = 7.0;
  let wit = 6.0;
  let confidence = 7.2;
  let conciseness = 7.5;

  if (input.mode === 'INTERVIEW') {
    conciseness = fillerCount < 3 ? 8.4 : 6.8;
    clarity = 8.2;
  }
  if (fillerCount > 4) {
    clarity -= 0.6;
    confidence -= 0.8;
  }

  const overall = parseFloat(
    ((storytelling + clarity + engagement + confidence + conciseness) / 5).toFixed(1)
  );

  const replays: SessionReplayMarker[] = [
    {
      id: 'm-1',
      timestampSeconds: Math.min(8, Math.round(input.durationSeconds * 0.1)),
      label: fillerCount > 2 ? 'Filler Word Start' : 'Clean Opening Hook',
      type: fillerCount > 2 ? 'FILLER_SPIKE' : 'STRONG_OPENING',
      textSnippet: transcript.slice(0, 45) + '...',
      advice: fillerCount > 2
        ? 'Pause silently for 1 second before speaking to eliminate default fillers.'
        : 'Crisp start. You created immediate curiosity without unnecessary setup.'
    },
    {
      id: 'm-2',
      timestampSeconds: Math.round(input.durationSeconds * 0.45),
      label: 'Core Explanation & Tension',
      type: 'EXCELLENT_ANALOGY',
      textSnippet: transcript.slice(Math.round(transcript.length * 0.3), Math.round(transcript.length * 0.6)) || 'Core explanation point...',
      advice: 'Strong relational comparison here. It makes abstract concepts tangible.'
    },
    {
      id: 'm-3',
      timestampSeconds: Math.round(input.durationSeconds * 0.75),
      label: 'Wit & Playful Reframing Opportunity',
      type: 'MISSED_WIT',
      textSnippet: transcript.slice(Math.round(transcript.length * 0.6), Math.round(transcript.length * 0.85)) || 'Transition section...',
      advice: 'You stated a serious conclusion flatly. A light, unexpected contrast would increase audience warmth.'
    },
    {
      id: 'm-4',
      timestampSeconds: Math.max(input.durationSeconds - 5, 10),
      label: 'Final Takeaway & Ending',
      type: 'STRONG_ENDING',
      textSnippet: transcript.slice(-50) || 'Final conclusion phrase.',
      advice: 'Resonant ending. Make sure your vocal pitch doesn’t drop off sharply on the final word.'
    }
  ];

  const whyCoaching: WhyCoachingCard[] = [
    {
      id: 'w-1',
      category: 'COMMUNICATION',
      observation: 'You explained the background setup for 25 seconds before introducing the core conflict.',
      impact: 'The human brain tunes out when given raw context without a reason to care.',
      principle: 'Curiosity before context. Ignite the spark first, then supply the fuel.',
      exemplarReframing: 'Instead of: "In 2023 we had a project with 5 microservices...", start with: "We were 10 minutes away from demoing to 50 executives when our main database flatlined."'
    },
    {
      id: 'w-2',
      category: 'COMMUNICATION',
      observation: 'You delivered the resolution with purely technical terms without tension release.',
      impact: 'The listener feels informed, but not personally connected or entertained.',
      principle: 'Contrast creates wit. Juxtaposing high technical stakes with everyday human moments creates natural lightness.',
      exemplarReframing: 'Instead of: "We restored from cold backup", say: "While the server restored, I drank enough coffee to fuel a rocket launch to Mars."'
    }
  ];

  const oneThingToPractice = input.mode === 'INTERVIEW'
    ? 'Answer with a specific result and explain the action you personally took.'
    : input.mode === 'CONVERSATION'
      ? 'Ask one relevant follow-up question before sharing your own perspective.'
      : 'Lead with your main point immediately, then unpack the supporting evidence.';

  const result: EvaluationResult = {
    score: overall,
    metrics: {
      overall,
      storytelling: parseFloat(storytelling.toFixed(1)),
      clarity: parseFloat(clarity.toFixed(1)),
      engagement: parseFloat(engagement.toFixed(1)),
      confidence: parseFloat(confidence.toFixed(1)),
      wit: parseFloat(wit.toFixed(1)),
      spontaneity: 7.4,
      conciseness: parseFloat(conciseness.toFixed(1)),
      structure: 8.0,
      audienceAdaptation: 7.6,
      explanationQuality: 8.1,
      fillerWordsCount: fillerCount,
      speakingPaceWPM: wpm,
      responseRelevance: 8.8
    },
    replays,
    whyCoaching,
    oneThingToPractice,
    source: 'MOCK'
  };

  if (input.previousAttemptSession) {
    result.deltas = calculateDeltas(result, input.previousAttemptSession);
  }
  return result;
}

function calculateDeltas(current: EvaluationResult, previous: Session): SessionDelta {
  const prevMetrics = previous.metrics;
  const currMetrics = current.metrics;
  const calcPct = (curr: number, prev: number) => {
    if (!prev) return 15;
    return Math.round(((curr - prev) / prev) * 100);
  };

  return {
    overallChangePct: calcPct(currMetrics.overall, prevMetrics.overall),
    hookStrengthChangePct: calcPct(currMetrics.engagement, prevMetrics.engagement),
    clarityChangePct: calcPct(currMetrics.clarity, prevMetrics.clarity),
    fillerReductionPct: prevMetrics.fillerWordsCount > 0
      ? Math.round(((prevMetrics.fillerWordsCount - currMetrics.fillerWordsCount) / prevMetrics.fillerWordsCount) * 100)
      : 25,
    emotionalDetailChangePct: calcPct(currMetrics.storytelling, prevMetrics.storytelling),
    endingImpactChangePct: calcPct(currMetrics.confidence, prevMetrics.confidence)
  };
}

export async function generateConversationReply(
  transcript: string,
  history: { speaker: string; text: string }[]
): Promise<string> {
  if (ai) {
    try {
      const prompt = [
        'You are a warm, thoughtful communication coach having a natural spoken conversation.',
        'Keep replies to 1-3 short sentences. Ask one relevant follow-up question.',
        'Conversation history:',
        ...history.slice(-8).map((item) => `${item.speaker}: ${item.text}`),
        `User: ${transcript}`
      ].join('\n');
      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      const reply = response.text?.trim();
      if (reply) return reply;
    } catch (error) {
      console.warn('Gemini conversation reply failed, using local reply:', (error as Error).message);
    }
  }

  const text = transcript.toLowerCase();
  if (/^(hi|hello|hey)\b/.test(text)) return 'Hello. What would you like to talk about today?';
  if (/\b(stress|anxious|nervous|worried)\b/.test(text)) {
    return 'That sounds difficult. What happened just before you started feeling that way?';
  }
  if (/\b(work|job|team|project|manager)\b/.test(text)) {
    return 'What part of that situation felt most important to you?';
  }
  return 'I understand. Could you tell me a little more about what happened and how you handled it?';
}
