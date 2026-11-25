import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  InterviewQa,
  InterviewVerdict,
  Session,
  TrainingMode,
  Utterance,
  WebSource
} from '../../types';
import { SpeechTracker } from '../../services/speechService';
import { answerInterview, evaluateSession, startInterview } from '../../services/aiCoachService';
import { SessionRecorder } from '../../services/recordingService';
import { api } from '../../services/api';
import {
  AlertCircle,
  Award,
  Mic,
  MicOff,
  Send,
  Square,
  Video,
  VideoOff,
  Volume2,
  VolumeX
} from 'lucide-react';

const ROLES = [
  'General HR',
  'Behavioral',
  'Software Engineer',
  'Data Analyst',
  'Product Manager',
  'Sales'
];

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const formatClock = (seconds: number) => {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
};
const silenceMs = 2200;

interface ChatItem {
  id: string;
  kind: 'question' | 'answer' | 'feedback';
  text: string;
  seconds: number;
  timestamp: string;
  verdict?: InterviewVerdict;
  score?: number;
  modelAnswer?: string;
  sources?: WebSource[];
}

interface Props {
  onSessionComplete: (session: Session) => void;
  previousAttemptSession?: Session | null;
  offlineMode: boolean;
}

export const InterviewMode: React.FC<Props> = ({ onSessionComplete, previousAttemptSession, offlineMode }) => {
  const [selectedRole, setSelectedRole] = useState(ROLES[0]);
  const [setupText, setSetupText] = useState('');
  const [phase, setPhase] = useState<'setup' | 'chat'>('setup');
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [interviewRole, setInterviewRole] = useState(selectedRole);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [volume, setVolume] = useState(0);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [error, setError] = useState('');

  const hasSpeechSupport = useState(() =>
    !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition
  )[0];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const trackerRef = useRef<SpeechTracker | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const silenceIntervalRef = useRef<number | null>(null);
  const chatRef = useRef<ChatItem[]>([]);
  const qaRef = useRef<InterviewQa[]>([]);
  const askedQuestionsRef = useRef<string[]>([]);
  const customQuestionsRef = useRef<string[]>([]);
  const roleRef = useRef(selectedRole);
  const currentQuestionRef = useRef('');
  const currentIsFollowUpRef = useRef(false);
  const phaseRef = useRef(phase);
  const isListeningRef = useRef(false);
  const isThinkingRef = useRef(false);
  const speakingRef = useRef(false);
  const voiceEnabledRef = useRef(true);
  const startedAtRef = useRef(0);
  const finalizingRef = useRef(false);
  const speechHeardRef = useRef(false);
  const lastVoiceAtRef = useRef(0);
  const lastTranscriptRef = useRef('');
  const startListeningRef = useRef<() => Promise<void>>(async () => {});
  const finishAnswerRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    phaseRef.current = phase;
    chatRef.current = chat;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [phase, chat]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  useEffect(() => {
    if (phase === 'chat' && videoRef.current && cameraStreamRef.current) {
      videoRef.current.srcObject = cameraStreamRef.current;
    }
  }, [phase]);

  useEffect(() => () => {
    if (silenceIntervalRef.current !== null) window.clearInterval(silenceIntervalRef.current);
    void trackerRef.current?.stop();
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    window.speechSynthesis?.cancel();
  }, []);

  const appendChat = useCallback((item: Omit<ChatItem, 'id' | 'seconds' | 'timestamp'>) => {
    const full: ChatItem = {
      ...item,
      id: createId(item.kind),
      seconds: startedAtRef.current ? (Date.now() - startedAtRef.current) / 1000 : 0,
      timestamp: new Date().toISOString()
    };
    setChat((previous) => [...previous, full]);
    chatRef.current = [...chatRef.current, full];
    return full;
  }, []);

  const appendQuestion = useCallback((question: string, isFollowUp: boolean) => {
    if (!question) return;
    appendChat({ kind: 'question', text: question });
    setCurrentQuestion(question);
    currentQuestionRef.current = question;
    currentIsFollowUpRef.current = isFollowUp;
    if (!askedQuestionsRef.current.includes(question)) {
      askedQuestionsRef.current = [...askedQuestionsRef.current, question];
    }
  }, [appendChat]);

  const stopSilenceWatcher = useCallback(() => {
    if (silenceIntervalRef.current !== null) {
      window.clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceEnabledRef.current || !('speechSynthesis' in window) || !text.trim()) return;
    window.speechSynthesis.cancel();
    speakingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    const resume = () => {
      speakingRef.current = false;
      if (phaseRef.current === 'chat' && voiceEnabledRef.current) void startListeningRef.current();
    };
    utterance.onend = resume;
    utterance.onerror = resume;
    window.speechSynthesis.speak(utterance);
  }, []);

  const startListening = useCallback(async () => {
    if (!hasSpeechSupport) {
      setError('This browser does not support speech recognition. Try Chrome or Edge.');
      return;
    }
    if (phaseRef.current !== 'chat' || isListeningRef.current || isThinkingRef.current || speakingRef.current) return;

    setError('');
    setLiveTranscript('');
    lastTranscriptRef.current = '';
    speechHeardRef.current = false;
    lastVoiceAtRef.current = Date.now();
    finalizingRef.current = false;

    const tracker = new SpeechTracker({
      onTranscriptUpdate: (full, interim) => {
        const combined = `${full} ${interim}`.trim();
        setLiveTranscript(combined);
        lastTranscriptRef.current = combined;
        if (combined) {
          speechHeardRef.current = true;
          lastVoiceAtRef.current = Date.now();
        }
      },
      onVolumeChange: (level) => {
        setVolume(level);
        if (level > 6 && lastTranscriptRef.current.trim()) {
          lastVoiceAtRef.current = Date.now();
        }
      },
      onPaceUpdate: () => {},
      onFillerDetected: () => {}
    });

    try {
      await tracker.start(cameraStreamRef.current ?? undefined);
    } catch {
      setError('Microphone could not be started. Check browser permissions and try again.');
      return;
    }

    trackerRef.current = tracker;
    isListeningRef.current = true;
    setIsListening(true);
    stopSilenceWatcher();
    silenceIntervalRef.current = window.setInterval(() => {
      if (finalizingRef.current) return;
      if (speechHeardRef.current && Date.now() - lastVoiceAtRef.current > silenceMs) {
        void finishAnswerRef.current();
      }
    }, 250);
  }, [hasSpeechSupport, stopSilenceWatcher]);

  const finishAnswer = useCallback(async () => {
    if (finalizingRef.current || !isListeningRef.current) return;
    finalizingRef.current = true;
    stopSilenceWatcher();
    isListeningRef.current = false;
    setIsListening(false);
    setLiveTranscript('');

    const tracker = trackerRef.current;
    await tracker?.stop();
    trackerRef.current = null;

    const transcript = (lastTranscriptRef.current || tracker?.getFinalTranscript() || '').trim();
    if (!transcript) {
      finalizingRef.current = false;
      setError('No speech detected. Please speak your answer and try again.');
      if (voiceEnabledRef.current) void startListeningRef.current();
      return;
    }

    const question = currentQuestionRef.current;
    if (!question) {
      finalizingRef.current = false;
      return;
    }

    appendChat({ kind: 'answer', text: transcript });
    isThinkingRef.current = true;
    setIsThinking(true);

    try {
      const history = chatRef.current.map((item) => ({
        speaker: item.kind === 'answer' ? 'USER' as const : 'AI' as const,
        text: item.kind === 'feedback' ? `Coach: ${item.text}` : item.text
      }));

      const result = await answerInterview({
        role: roleRef.current,
        question,
        answer: transcript,
        history,
        customQuestions: customQuestionsRef.current,
        askedQuestions: askedQuestionsRef.current,
        isFollowUp: currentIsFollowUpRef.current
      });

      qaRef.current = [...qaRef.current, {
        question,
        answer: transcript,
        feedback: result.feedback,
        verdict: result.verdict,
        modelAnswer: result.modelAnswer,
        score: result.score,
        sources: result.sources
      }];

      appendChat({
        kind: 'feedback',
        text: result.feedback,
        verdict: result.verdict,
        score: result.score,
        modelAnswer: result.modelAnswer,
        sources: result.sources
      });

      const nextQuestion = !currentIsFollowUpRef.current && result.followUp
        ? result.followUp
        : result.nextQuestion;
      appendQuestion(nextQuestion, !currentIsFollowUpRef.current && !!result.followUp);
      speak(`${result.feedback} A strong answer would be: ${result.modelAnswer} ${nextQuestion}`);
    } catch (caught) {
      setError(`Interview reply failed: ${(caught as Error).message}`);
    } finally {
      isThinkingRef.current = false;
      setIsThinking(false);
      finalizingRef.current = false;
    }
  }, [appendChat, appendQuestion, speak, stopSilenceWatcher]);

  useEffect(() => {
    startListeningRef.current = startListening;
    finishAnswerRef.current = finishAnswer;
  }, [startListening, finishAnswer]);

  const handleStart = async () => {
    const lines = setupText.split('\n').map((line) => line.trim()).filter(Boolean);
    const customQuestions = lines
      .filter((line) => line.includes('?') || /^\d+[.)]\s*/.test(line))
      .map((line) => line.replace(/^\d+[.)]\s*/, '').trim())
      .filter(Boolean);
    const role = lines.length && !customQuestions.length ? lines.join(' ') : selectedRole;

    setError('');
    roleRef.current = role;
    setInterviewRole(role);
    customQuestionsRef.current = customQuestions;
    askedQuestionsRef.current = [];
    qaRef.current = [];
    currentQuestionRef.current = '';
    currentIsFollowUpRef.current = false;
    startedAtRef.current = Date.now();
    chatRef.current = [];
    setChat([]);

    if (cameraStreamRef.current) {
      const recorder = new SessionRecorder();
      if (recorder.start(cameraStreamRef.current)) recorderRef.current = recorder;
    }

    phaseRef.current = 'chat';
    setPhase('chat');
    isThinkingRef.current = true;
    setIsThinking(true);

    try {
      const result = await startInterview({ role, customQuestions });
      appendQuestion(result.question, false);
      speak(result.question);
    } catch (caught) {
      setError(`Could not start the interview: ${(caught as Error).message}`);
      phaseRef.current = 'setup';
      setPhase('setup');
    } finally {
      isThinkingRef.current = false;
      setIsThinking(false);
    }
  };

  const handleEnd = async () => {
    stopSilenceWatcher();
    isListeningRef.current = false;
    setIsListening(false);
    const tracker = trackerRef.current;
    if (tracker) await tracker.stop();
    trackerRef.current = null;
    window.speechSynthesis?.cancel();
    speakingRef.current = false;

    const qa = qaRef.current;
    if (!qa.length) {
      setError('Answer at least one question before ending the interview.');
      return;
    }

    isThinkingRef.current = true;
    setIsThinking(true);

    try {
      const transcript = qa
        .map((item, index) => `Question ${index + 1}: ${item.question}\nAnswer: ${item.answer}`)
        .join('\n\n');
      const durationSeconds = Math.max(10, Math.round((Date.now() - startedAtRef.current) / 1000));
      const evalResult = await evaluateSession({
        mode: 'INTERVIEW' as TrainingMode,
        contextPrompt: `Role: ${roleRef.current}${customQuestionsRef.current.length
          ? ` · ${customQuestionsRef.current.length} custom questions`
          : ' · AI-generated questions'}`,
        transcript,
        durationSeconds,
        previousAttemptSession
      });

      const sessionId = `sess-${crypto.randomUUID()}`;
      const recording = await (recorderRef.current?.stop() ?? Promise.resolve(null));
      const mediaUrl = recording ? (await api.uploadRecording(sessionId, recording)) ?? undefined : undefined;
      recorderRef.current = null;

      const utterances: Utterance[] = chatRef.current.map((item) => ({
        id: item.id,
        speaker: item.kind === 'answer' ? 'USER' : 'AI',
        timestamp: formatClock(item.seconds),
        text: item.kind === 'feedback'
          ? `Coach: ${item.text}. Strong answer: ${item.modelAnswer}`
          : item.text
      }));

      const newSession: Session = {
        id: sessionId,
        timestamp: new Date().toISOString(),
        mode: 'INTERVIEW',
        modeLabel: 'Interview Simulator',
        durationSeconds,
        contextPrompt: `Role: ${roleRef.current}`,
        targetAudience: roleRef.current,
        transcript,
        utterances,
        score: evalResult.score,
        metrics: evalResult.metrics,
        replays: evalResult.replays,
        whyCoaching: evalResult.whyCoaching,
        attemptNumber: previousAttemptSession ? previousAttemptSession.attemptNumber + 1 : 1,
        previousAttemptId: previousAttemptSession?.id,
        deltas: evalResult.deltas,
        oneThingToPractice: evalResult.oneThingToPractice,
        mediaUrl,
        evaluationSource: evalResult.source,
        interviewQa: qa
      };

      onSessionComplete(newSession);
    } catch (caught) {
      setError(`Could not save the session: ${(caught as Error).message}`);
    } finally {
      isThinkingRef.current = false;
      setIsThinking(false);
    }
  };

  const toggleCamera = async () => {
    if (cameraEnabled) {
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraEnabled(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      cameraStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraEnabled(true);
    } catch {
      setError('Camera access was denied. You can continue with voice only.');
    }
  };

  const renderChatItem = (item: ChatItem) => {
    if (item.kind === 'question') {
      return (
        <div key={item.id} className="chat-row chat-row-ai">
          <div className="chat-avatar">AI</div>
          <div className="chat-bubble chat-question">
            <span>Interviewer</span>
            <p>{item.text}</p>
          </div>
        </div>
      );
    }

    if (item.kind === 'answer') {
      return (
        <div key={item.id} className="chat-row chat-row-user">
          <div className="chat-bubble chat-answer">
            <span>You</span>
            <p>{item.text}</p>
          </div>
        </div>
      );
    }

    return (
      <div key={item.id} className="chat-row chat-row-ai">
        <div className="chat-avatar chat-avatar-coach">Coach</div>
        <div className="coach-card">
          <div className="coach-card-top">
            <span className={`verdict-badge verdict-${item.verdict ?? 'partial'}`}>
              {item.verdict ?? 'partial'}
            </span>
            <strong>{item.score?.toFixed(1) ?? '—'} / 10</strong>
          </div>
          <p>{item.text}</p>
          <div className="coach-model">
            <span className="eyebrow">Strong answer</span>
            <p>{item.modelAnswer}</p>
          </div>
          {!!item.sources?.length && (
            <div className="answer-sources">
              <span className="eyebrow">Sources</span>
              <div>
                {item.sources.map((source) => (
                  <a key={source.uri} href={source.uri} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="practice-layout">
      <header className="practice-header">
        <div>
          <p className="eyebrow">Interview</p>
          <h1>Spoken interview practice</h1>
          <p>Choose a role, answer out loud, and get an accurate model answer after every response.</p>
        </div>
        <Award className="practice-header-icon" />
      </header>

      {(offlineMode || !hasSpeechSupport) && (
        <div className="interview-notice">
          <AlertCircle className="w-5 h-5" />
          <span>
            {offlineMode
              ? 'Web-grounded interviews need Online mode. Turn Offline mode off in the header to start.'
              : 'This browser has no speech recognition. Use Chrome or Edge for voice answers.'}
          </span>
        </div>
      )}

      {phase === 'setup' ? (
        <div className="interview-setup">
          <section className="setup-card">
            <div className="setup-section-head">
              <Award className="w-6 h-6" />
              <div>
                <p className="eyebrow">Step 1</p>
                <h2>Set up your interview</h2>
                <p>Pick a role or paste your own questions. Answers and feedback are grounded in current web sources.</p>
              </div>
            </div>

            <p className="eyebrow">Interview type</p>
            <div className="role-chips">
              {ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={selectedRole === role ? 'role-chip role-chip-active' : 'role-chip'}
                >
                  {role}
                </button>
              ))}
            </div>

            <label className="setup-label" htmlFor="interview-setup-text">
              Your role or your questions
            </label>
            <textarea
              id="interview-setup-text"
              className="setup-textarea"
              value={setupText}
              onChange={(event) => setSetupText(event.target.value)}
              placeholder="e.g. Senior frontend engineer with 5 years of React experience — or paste your questions, one per line"
              rows={5}
            />
            <p className="setup-hint">
              Leave blank to use the selected role. Paste one question per line to use your own questions.
            </p>

            {error && (
              <div className="interview-error">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}

            <div className="setup-actions">
              <button onClick={() => void toggleCamera()} className="secondary-button">
                {cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                Camera {cameraEnabled ? 'on' : 'off'}
              </button>
              <button
                onClick={() => void handleStart()}
                className="primary-action"
                disabled={offlineMode || !hasSpeechSupport || isThinking}
              >
                <Send className="w-4 h-4" /> Start interview
              </button>
            </div>
          </section>

          <aside className="setup-tips">
            <p className="eyebrow">How it works</p>
            <ol>
              <li>The interviewer asks one question at a time and speaks it aloud.</li>
              <li>Press speak, answer naturally, and pause when you are done.</li>
              <li>You get honest feedback plus an accurate model answer with sources.</li>
              <li>End whenever you like — the full Q&A is saved to your history.</li>
            </ol>
            <div className="setup-tip-voice">
              {voiceEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              <span>Voice answers only — camera is completely optional.</span>
            </div>
          </aside>
        </div>
      ) : (
        <div className="interview-chat-layout">
          <section className="chat-panel">
            <div className="chat-header">
              <div>
                <p className="eyebrow">Live interview</p>
                <strong>{interviewRole}</strong>
              </div>
              <div className="chat-header-actions">
                <button
                  onClick={() => setVoiceEnabled((enabled) => !enabled)}
                  className="secondary-button"
                  title="Toggle spoken interviewer"
                >
                  {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  Voice
                </button>
                <button onClick={() => void handleEnd()} className="stop-action" disabled={isThinking}>
                  <Square className="w-4 h-4" /> End &amp; save
                </button>
              </div>
            </div>

            <div className="chat-thread">
              {chat.map(renderChatItem)}
              {isThinking && <div className="chat-typing">Interviewer is preparing the next question…</div>}
              <div ref={bottomRef} />
            </div>

            <div className="chat-controls">
              <button
                onClick={() => (isListening ? void finishAnswer() : void startListening())}
                className={isListening ? 'mic-button mic-active' : 'mic-button'}
                disabled={isThinking}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                {isListening ? 'Done answering' : 'Speak answer'}
              </button>
              <div className="live-answer">
                {isListening
                  ? (liveTranscript || 'Listening… speak your answer.')
                  : currentQuestion
                    ? `Question: ${currentQuestion}`
                    : 'Press speak to answer.'}
              </div>
              <div className="volume-track"><div style={{ width: `${volume}%` }} /></div>
            </div>

            {error && (
              <div className="interview-error chat-error">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}
          </section>

          <aside className="interview-side">
            <div className={cameraEnabled ? 'camera-card' : 'camera-card camera-off'}>
              <video ref={videoRef} autoPlay playsInline muted />
              {!cameraEnabled && (
                <div className="camera-empty">
                  <VideoOff className="w-7 h-7" />
                  <strong>Camera off</strong>
                  <span>Voice practice works without it.</span>
                </div>
              )}
              <div className="live-metrics">
                <span><Mic className="w-4 h-4" /> {isListening ? `Mic ${volume}%` : 'Mic ready'}</span>
                {isListening && <span className="recording-badge">Listening</span>}
              </div>
            </div>

            <div className="interview-current-question">
              <p className="eyebrow">Current question</p>
              <p>{currentQuestion || 'Waiting for the interviewer…'}</p>
            </div>

            <div className="interview-side-note">
              Answers end automatically after a short pause. You can also press “Done answering”.
            </div>
          </aside>
        </div>
      )}
    </div>
  );
};
