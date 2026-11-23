import React, { useState, useEffect, useRef } from 'react';
import type { Session, TrainingMode, WordTiming } from '../../types';
import { SpeechTracker } from '../../services/speechService';
import { evaluateSession } from '../../services/aiCoachService';
import { SessionRecorder } from '../../services/recordingService';
import { api } from '../../services/api';
import { Award, Video, Mic, AlertCircle, Volume2 } from 'lucide-react';

interface Props {
  onSessionComplete: (session: Session) => void;
  previousAttemptSession?: Session | null;
  offlineMode: boolean;
}

const QUESTIONS = [
  "Why should we hire you over other candidate options?",
  "Tell me about a time you made a major technical mistake under pressure.",
  "How do you handle disagreement with a manager when you know your solution is right?"
];

export const InterviewMode: React.FC<Props> = ({ onSessionComplete, previousAttemptSession, offlineMode }) => {
  const [selectedQuestion, setSelectedQuestion] = useState(QUESTIONS[0]);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [noSpeech, setNoSpeech] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const trackerRef = useRef<SpeechTracker | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    const video = videoRef.current;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (video) video.srcObject = stream;
        setCameraActive(true);
      } catch (err) {
        console.warn('Camera access denied or unavailable:', err);
      }
    }
    setupCamera();

    return () => {
      if (video && video.srcObject) {
        (video.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
    };
  }, []);

  const handleStart = async () => {
    setTranscript('');
    setTimerSeconds(0);
    setVolume(0);
    setNoSpeech(false);
    setTranscriptionError('');
    setIsRecording(true);

    if (streamRef.current) {
      const recorder = new SessionRecorder();
      if (recorder.start(streamRef.current)) recorderRef.current = recorder;
    }

    if (!offlineMode) {
      const tracker = new SpeechTracker({
        onTranscriptUpdate: (full, interim) => setTranscript((full + ' ' + interim).trim()),
        onVolumeChange: (level) => setVolume(level),
        onPaceUpdate: () => {},
        onFillerDetected: () => {}
      });

      trackerRef.current = tracker;
      await tracker.start(streamRef.current ?? undefined);
    }

    timerRef.current = setInterval(() => setTimerSeconds((p) => p + 1), 1000);
  };

  const handleStop = async () => {
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (trackerRef.current) trackerRef.current.stop();
    const recording = await (recorderRef.current?.stop() ?? Promise.resolve(null));
    const sessionId = `sess-${crypto.randomUUID()}`;

    let finalTranscript = transcript.trim();
    let wordTimings: WordTiming[] = [];

    if (offlineMode) {
      if (!recording) {
        setTranscriptionError('No audio was recorded. Check your microphone and try again.');
        return;
      }
      try {
        const transcription = await api.transcribeAudio(recording);
        finalTranscript = transcription.text.trim();
        wordTimings = transcription.wordTimings;
      } catch {
        setTranscriptionError('Local transcription unavailable. Start your Whisper service and try again.');
        return;
      }
    }

    if (!finalTranscript) {
      setNoSpeech(true);
      return;
    }

    const evalResult = await evaluateSession({
      mode: 'INTERVIEW' as TrainingMode,
      contextPrompt: selectedQuestion,
      transcript: finalTranscript,
      durationSeconds: Math.max(10, timerSeconds),
      wordTimings,
      previousAttemptSession
    });

    const mediaUrl = recording ? (await api.uploadRecording(sessionId, recording)) ?? undefined : undefined;
    const attemptNum = previousAttemptSession ? previousAttemptSession.attemptNumber + 1 : 1;

    const newSession: Session = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      mode: 'INTERVIEW',
      modeLabel: 'Interview Simulator',
      durationSeconds: Math.max(10, timerSeconds),
      contextPrompt: selectedQuestion,
      transcript: finalTranscript,
      score: evalResult.score,
      utterances: [
        { id: 'u1', speaker: 'AI', timestamp: '00:00', text: selectedQuestion },
        { id: 'u2', speaker: 'USER', timestamp: '00:04', text: finalTranscript }
      ],
      metrics: evalResult.metrics,
      replays: evalResult.replays,
      whyCoaching: evalResult.whyCoaching,
      attemptNumber: attemptNum,
      previousAttemptId: previousAttemptSession?.id,
      deltas: evalResult.deltas,
      oneThingToPractice: evalResult.oneThingToPractice,
      mediaUrl,
      evaluationSource: evalResult.source,
      wordTimings
    };

    onSessionComplete(newSession);
  };

  const speakQuestion = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(selectedQuestion);
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  return (
    <div className="practice-layout">
      <header className="practice-header">
        <div>
          <p className="eyebrow">Interview</p>
          <h1>Practice a focused answer</h1>
          <p>Choose a question, record your answer on camera, and review where you can improve.</p>
        </div>
        <Award className="practice-header-icon" />
      </header>

      <div className="interview-grid">
        <aside className="question-list">
          <p className="eyebrow">Questions</p>
          {QUESTIONS.map((question, index) => (
            <button
              key={question}
              onClick={() => setSelectedQuestion(question)}
              className={selectedQuestion === question ? 'question-active' : ''}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{question}</strong>
            </button>
          ))}
        </aside>

        <section className="answer-card interview-answer">
          <div className="camera-card interview-camera">
            <video ref={videoRef} autoPlay playsInline muted />
            {!cameraActive && (
              <div className="camera-empty">
                <Video className="w-8 h-8" />
                <strong>Camera not available</strong>
                <span>Allow camera and microphone access to record your answer.</span>
              </div>
            )}
            <div className="live-metrics">
              <span>
                <Mic className="w-4 h-4" />
                {cameraActive ? (isRecording ? `Mic ${volume}%` : 'Mic ready') : 'Mic unavailable'}
              </span>
              {isRecording && <span className="recording-badge">Recording</span>}
            </div>
            {isRecording && (
              <div className="interview-mic-track"><div style={{ width: `${volume}%` }} /></div>
            )}
          </div>
          <div className="answer-top">
            <div className="question-with-speaker">
              <p>{selectedQuestion}</p>
              <button onClick={speakQuestion} className="speak-button" title="Hear the question (offline T2S)">
                <Volume2 className="w-4 h-4" />
              </button>
            </div>
            <div className="answer-time">
              {Math.floor(timerSeconds / 60).toString().padStart(2, '0')}:
              {(timerSeconds % 60).toString().padStart(2, '0')}
            </div>
          </div>
          <div className="answer-transcript">
            <span>{offlineMode ? 'Response (after local transcription)' : 'Response'}</span>
            <p>{transcript || (offlineMode
              ? 'Offline mode: your answer is transcribed locally after you finish.'
              : 'Your answer will appear here as you speak.')}</p>
          </div>
          {!isRecording ? (
            <button onClick={handleStart} className="primary-action">
              Start answer
            </button>
          ) : (
            <button onClick={handleStop} className="stop-action">
              Submit & evaluate
            </button>
          )}
          {noSpeech && (
            <div className="no-speech">
              <AlertCircle className="w-4 h-4" />
              <span>No speech detected. Nothing was analyzed — press start to try again.</span>
            </div>
          )}
          {transcriptionError && (
            <div className="no-speech">
              <AlertCircle className="w-4 h-4" />
              <span>{transcriptionError}</span>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
