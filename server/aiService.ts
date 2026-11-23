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

// Same prompt + same seed + temperature 0 = same score on every run, so the
// Progress trend reflects real improvement instead of model variance.
const DETERMINISTIC_CONFIG = {
  temperature: 0,
  topP: 1,
  topK: 1,
  seed: 20240101
} as const;

const clamp = (value: number, min = 1, max = 10) => Math.max(min, Math.min(max, value));
const round1 = (value: number) => Math.round(value * 10) / 10;

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
    contents: prompt,
    config: DETERMINISTIC_CONFIG
  });
  const text = response.text || '';
  const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleanJson);

  if (input.previousAttemptSession) {
    parsed.deltas = calculateDeltas(parsed, input.previousAttemptSession);
  }
  return { ...parsed, source: 'AI' as const };
}

// Deterministic heuristic scoring. Every number comes from measurable signals
// in this transcript, so re-evaluating the same answer gives the same score and
// weak/strong answers land far apart instead of clustering around 7.x.
function generateIntelligentMockEvaluation(input: EvaluationInput): EvaluationResult {
  const transcript = input.transcript || '';
  const words = transcript.split(/\s+/).map((word) => word.toLowerCase()).filter(Boolean);
  const wordCount = words.length;
  const fillerRegex = /\b(um|uh|like|basically|you know|sort of|kind of|i mean|honestly|actually)\b/gi;
  const fillerCount = (transcript.match(fillerRegex) || []).length;
  const fillerRate = (fillerCount / Math.max(1, wordCount)) * 100;
  const wpm = input.durationSeconds > 0 ? Math.round((wordCount / input.durationSeconds) * 60) : 135;

  const sentences = transcript.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
  const longSentences = sentences.filter((sentence) => sentence.split(/\s+/).length > 30).length;
  const longSentenceRatio = longSentences / Math.max(1, sentences.length);
  const uniqueRatio = new Set(words).size / Math.max(1, wordCount);
  const repeatedPairs = words.slice(1).filter((word, index) => word === words[index]).length;

  const hedgeCount = (transcript.match(/\b(maybe|perhaps|i think|i guess|probably|somewhat|i suppose)\b/gi) || []).length;
  const questionCount = (transcript.match(/\?/g) || []).length;
  const structureCount = (transcript.match(/\b(first|second|then|next|finally|in conclusion|because|however|for example|so)\b/gi) || []).length;
  const specificityCount = (transcript.match(/\b(\d+%?|\$\d+|increased|reduced|saved|shipped|launched|delivered|improved|achieved|grew|cut|built|led)\b/gi) || []).length;

  const fillerPenalty = Math.min(2.6, fillerRate * 1.1);
  const hedgePenalty = Math.min(1.2, hedgeCount * 0.3);
  const runOnPenalty = Math.min(1.6, longSentenceRatio * 7);
  const repetitionPenalty = Math.min(1, repeatedPairs * 0.35);

  const specificityBonus = Math.min(1.8, specificityCount * 0.35);
  const structureBonus = Math.min(1.2, structureCount * 0.22);
  const questionBonus = Math.min(1, questionCount * 0.5);
  const diversityBonus = (uniqueRatio - 0.45) * 3;
  const paceBonus = wpm >= 120 && wpm <= 165 ? 0.5 : wpm < 90 ? -0.8 : wpm > 190 ? -1 : 0;
  const lengthBonus = wordCount >= 60 ? 0.4 : wordCount < 20 ? -1 : 0;

  const overall = round1(clamp(
    6.0 + specificityBonus + structureBonus + questionBonus + diversityBonus + paceBonus + lengthBonus
    - fillerPenalty - hedgePenalty - runOnPenalty - repetitionPenalty
  ));

  const clarity = round1(clamp(overall - fillerPenalty * 0.5 + structureBonus * 0.4 + 0.2));
  const confidence = round1(clamp(overall - hedgePenalty * 1.4 + 0.3));
  const engagement = round1(clamp(overall + questionBonus * 0.8 - runOnPenalty * 0.3));
  const storytelling = round1(clamp(overall + specificityBonus * 0.3 - (input.mode === 'INTERVIEW' ? 0.6 : 0)));
  const conciseness = round1(clamp(overall - runOnPenalty * 0.7 + (input.mode === 'INTERVIEW' ? 0.3 : 0)));
  const structure = round1(clamp(overall + structureBonus * 0.8));

  const replays: SessionReplayMarker[] = [
    {
      id: 'm-1',
      timestampSeconds: Math.min(8, Math.round(input.durationSeconds * 0.1)),
      label: fillerCount > 0 ? 'Filler Word Start' : 'Clean Opening Hook',
      type: fillerCount > 0 ? 'FILLER_SPIKE' : 'STRONG_OPENING',
      textSnippet: (fillerCount > 0 ? transcript.match(new RegExp(fillerRegex.source, 'i'))?.[0] : transcript.slice(0, 45)) || transcript.slice(0, 45),
      advice: fillerCount > 0
        ? `You used ${fillerCount} filler${fillerCount === 1 ? '' : 's'} (${fillerRate.toFixed(1)} per 100 words). Pause silently for one beat instead.`
        : 'Crisp start. You created immediate curiosity without unnecessary setup.'
    },
    {
      id: 'm-2',
      timestampSeconds: Math.round(input.durationSeconds * 0.45),
      label: longSentences > 0 ? 'Run-on Explanation' : 'Core Explanation',
      type: longSentences > 0 ? 'LOST_CLARITY' : 'EXCELLENT_ANALOGY',
      textSnippet: transcript.slice(Math.round(transcript.length * 0.3), Math.round(transcript.length * 0.6)) || 'Core explanation point...',
      advice: longSentences > 0
        ? `${longSentences} sentence${longSentences === 1 ? '' : 's'} ran past 30 words. Split the longest one in two.`
        : 'Clear relational explanation. It makes abstract ideas tangible.'
    },
    {
      id: 'm-3',
      timestampSeconds: Math.round(input.durationSeconds * 0.75),
      label: specificityCount === 0 ? 'Missing Concrete Proof' : 'Specific Result',
      type: specificityCount === 0 ? 'MISSED_WIT' : 'EXCELLENT_ANALOGY',
      textSnippet: transcript.slice(Math.round(transcript.length * 0.6), Math.round(transcript.length * 0.85)) || 'Transition section...',
      advice: specificityCount === 0
        ? 'No numbers or results yet. Add one measurable outcome to make the point stick.'
        : `${specificityCount} concrete detail${specificityCount === 1 ? '' : 's'} here land well. Keep naming real outcomes.`
    },
    {
      id: 'm-4',
      timestampSeconds: Math.max(input.durationSeconds - 5, 10),
      label: 'Final Takeaway & Ending',
      type: 'STRONG_ENDING',
      textSnippet: transcript.slice(-50) || 'Final conclusion phrase.',
      advice: 'Finish with one clear takeaway and avoid dropping your vocal pitch on the last word.'
    }
  ];

  const whyCoaching: WhyCoachingCard[] = [];
  if (fillerRate > 2) {
    whyCoaching.push({
      id: 'w-fillers',
      category: 'COMMUNICATION',
      observation: `You used ${fillerCount} filler words in ${wordCount} words (${fillerRate.toFixed(1)} per 100).`,
      impact: 'Fillers signal searching for words and reduce perceived authority.',
      principle: 'Silence is a punctuation mark. A one-second pause reads as confidence.',
      exemplarReframing: 'Instead of: "Um, basically we, uh, shipped it", say: "We shipped it."'
    });
  }
  if (longSentenceRatio > 0.15) {
    whyCoaching.push({
      id: 'w-runon',
      category: 'COMMUNICATION',
      observation: `${longSentences} of ${sentences.length} sentences ran past 30 words.`,
      impact: 'Listeners lose the thread before the conclusion arrives.',
      principle: 'One idea per sentence. Let the period do the work.',
      exemplarReframing: 'Split the longest sentence at its first "and" into two shorter statements.'
    });
  }
  if (specificityCount === 0) {
    whyCoaching.push({
      id: 'w-specifics',
      category: 'COMMUNICATION',
      observation: 'The answer contains no numbers, results, or concrete outcomes.',
      impact: 'Vague claims are forgettable and hard to verify.',
      principle: 'Specificity is credibility. Name a number, a time, or a result.',
      exemplarReframing: 'Instead of: "We improved performance", say: "We cut p95 latency from 900ms to 240ms."'
    });
  }
  if (hedgeCount > 1) {
    whyCoaching.push({
      id: 'w-hedges',
      category: 'COMMUNICATION',
      observation: `You hedged ${hedgeCount} times with phrases like "I think" or "maybe".`,
      impact: 'Hedging makes a clear point sound tentative.',
      principle: 'State the claim, then qualify the evidence — not the other way around.',
      exemplarReframing: 'Instead of: "I think it might work", say: "It works. Here is the evidence."'
    });
  }
  if (whyCoaching.length === 0) {
    whyCoaching.push({
      id: 'w-strong',
      category: 'COMMUNICATION',
      observation: `Your answer used ${specificityCount} concrete detail${specificityCount === 1 ? '' : 's'} and ${structureCount} signpost${structureCount === 1 ? '' : 's'} with very few fillers.`,
      impact: 'The listener can follow and remember your point.',
      principle: 'Clarity compounds. Keep leading with the point and supporting it with specifics.',
      exemplarReframing: 'Next step: add one short story so the detail becomes memorable.'
    });
  }

  const oneThingToPractice = fillerRate > 2
    ? 'Replace your next filler with a one-second silent pause.'
    : longSentenceRatio > 0.15
      ? 'Split your longest sentence into two shorter ones.'
      : specificityCount === 0
        ? 'Add one number or concrete result to your answer.'
        : hedgeCount > 1
          ? 'Remove "I think" and "maybe" and state the point directly.'
          : 'Keep leading with the main point, then add one specific example.';

  const result: EvaluationResult = {
    score: overall,
    metrics: {
      overall,
      storytelling,
      clarity,
      engagement,
      confidence,
      wit: round1(clamp(overall - 1)),
      spontaneity: round1(clamp(overall - hedgePenalty * 0.5 + 0.2)),
      conciseness,
      structure,
      audienceAdaptation: round1(clamp(overall + questionBonus * 0.6 - hedgePenalty * 0.3)),
      explanationQuality: round1(clamp(overall + specificityBonus * 0.5 + structureBonus * 0.3)),
      fillerWordsCount: fillerCount,
      speakingPaceWPM: wpm,
      responseRelevance: round1(clamp(overall + specificityBonus * 0.2))
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
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: DETERMINISTIC_CONFIG
      });
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
