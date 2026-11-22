export type TrainingMode = 'LIVE_COACH' | 'CONVERSATION' | 'INTERVIEW';

export type MarkerType =
  | 'STRONG_OPENING'
  | 'FILLER_SPIKE'
  | 'LOST_CLARITY'
  | 'EXCELLENT_ANALOGY'
  | 'MISSED_WIT'
  | 'STRONG_ENDING';

export interface CommunicationMetrics {
  overall: number;
  storytelling: number;
  clarity: number;
  engagement: number;
  confidence: number;
  wit: number;
  spontaneity: number;
  conciseness: number;
  structure: number;
  audienceAdaptation: number;
  explanationQuality: number;
  fillerWordsCount: number;
  speakingPaceWPM: number;
  responseRelevance: number;
}

export interface SessionReplayMarker {
  id: string;
  timestampSeconds: number;
  label: string;
  type: MarkerType;
  textSnippet: string;
  advice: string;
  scoreImpact?: string;
}

export interface WhyCoachingCard {
  id: string;
  category: 'COMMUNICATION';
  observation: string;
  impact: string;
  principle: string;
  exemplarReframing: string;
}

export interface Utterance {
  id: string;
  speaker: 'USER' | 'AI';
  timestamp: string;
  text: string;
  metrics?: {
    paceWPM?: number;
    fillerCount?: number;
    clarityScore?: number;
  };
}

export interface SessionDelta {
  overallChangePct: number;
  hookStrengthChangePct: number;
  clarityChangePct: number;
  fillerReductionPct: number;
  emotionalDetailChangePct: number;
  endingImpactChangePct: number;
}

export interface Session {
  id: string;
  timestamp: string;
  mode: TrainingMode;
  modeLabel: string;
  durationSeconds: number;
  contextPrompt: string;
  targetAudience?: string;
  utterances: Utterance[];
  transcript: string;
  score: number;
  metrics: CommunicationMetrics;
  replays: SessionReplayMarker[];
  whyCoaching: WhyCoachingCard[];
  attemptNumber: number;
  previousAttemptId?: string;
  deltas?: SessionDelta;
  oneThingToPractice: string;
  mediaUrl?: string;
}

export interface SavedConversation {
  id: string;
  title: string;
  updatedAt: string;
  utterances: Utterance[];
}
