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

export interface SessionQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  mode?: TrainingMode | 'ALL';
  sortBy?: 'date' | 'score' | 'duration';
  scoreMin?: number;
  scoreMax?: number;
  dateFrom?: string;
  dateTo?: string;
}

export interface SessionPage {
  items: Session[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ProgressStats {
  summary: { total: number; average: number; best: number; recent: number };
  trend: { id: string; timestamp: string; score: number }[];
  averages: Record<string, number>;
  comparisons: {
    id: string;
    mode: TrainingMode;
    timestamp: string;
    previousScore: number;
    score: number;
    changePct: number;
    deltas?: SessionDelta;
  }[];
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
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

export interface WebSource {
  title: string;
  uri: string;
}

export type InterviewVerdict = 'strong' | 'partial' | 'weak';

export interface InterviewQa {
  question: string;
  answer: string;
  feedback: string;
  verdict: InterviewVerdict;
  modelAnswer: string;
  score: number;
  sources: WebSource[];
}

export interface InterviewTurnInput {
  role: string;
  question: string;
  answer: string;
  history: { speaker: 'AI' | 'USER'; text: string }[];
  customQuestions: string[];
  askedQuestions: string[];
  isFollowUp: boolean;
}

export interface InterviewTurnResult {
  feedback: string;
  verdict: InterviewVerdict;
  modelAnswer: string;
  score: number;
  followUp: string;
  nextQuestion: string;
  sources: WebSource[];
}

export interface InterviewStartResult {
  question: string;
  sources: WebSource[];
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
  evaluationSource?: 'AI' | 'MOCK';
  wordTimings?: WordTiming[];
  interviewQa?: InterviewQa[];
}

export interface SavedConversation {
  id: string;
  title: string;
  updatedAt: string;
  utterances: Utterance[];
}
