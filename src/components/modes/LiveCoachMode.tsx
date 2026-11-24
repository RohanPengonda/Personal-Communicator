import React, { useState, useEffect, useRef } from 'react';
import type { Session, TrainingMode, WordTiming } from '../../types';
import { SpeechTracker } from '../../services/speechService';
import { evaluateSession } from '../../services/aiCoachService';
import { SessionRecorder } from '../../services/recordingService';
import { api } from '../../services/api';
import { Video, Mic, Square, Sparkles, Activity, AlertCircle, Eye } from 'lucide-react';

interface LiveCoachModeProps {
  onSessionComplete: (session: Session) => void;
  previousAttemptSession?: Session | null;
  offlineMode: boolean;
}

export const LiveCoachMode: React.FC<LiveCoachModeProps> = ({
  onSessionComplete,
  previousAttemptSession,
  offlineMode
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [volume, setVolume] = useState(0);
  const [paceWpm, setPaceWpm] = useState(0);
  const [fillerCount, setFillerCount] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [noSpeech, setNoSpeech] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<SessionRecorder | null>(null);
  const speechTrackerRef = useRef<SpeechTracker | null>(null);
  const wordTimingsRef = useRef<WordTiming[]>([]);
  const timerRef = useRef<any>(null);

  // Initialize Camera MediaStream
  useEffect(() => {
    const video = videoRef.current;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = stream;
        if (video) {
          video.srcObject = stream;
        }
        setCameraActive(true);
      } catch (err) {
        console.warn('Camera access denied or unavailable:', err);
      }
    }
    setupCamera();

    return () => {
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
    };
  }, []);

  const handleStartRecording = async () => {
    setTranscript('');
    setInterimText('');
    setFillerCount(0);
    setPaceWpm(0);
    setTimerSeconds(0);
    setNoSpeech(false);
    setTranscriptionError('');
    wordTimingsRef.current = [];
    setIsRecording(true);

    if (streamRef.current) {
      const recorder = new SessionRecorder();
      if (recorder.start(streamRef.current)) recorderRef.current = recorder;
    }

    if (!offlineMode) {
      const tracker = new SpeechTracker({
        onTranscriptUpdate: (full, interim) => {
          setTranscript(full);
          setInterimText(interim);
        },
        onVolumeChange: (vol) => setVolume(vol),
        onPaceUpdate: (wpm) => setPaceWpm(wpm),
        onFillerDetected: (count, _word) => {
          setFillerCount(count);
        },
        onWordTimings: (timings) => {
          wordTimingsRef.current = timings;
        }
      });

      speechTrackerRef.current = tracker;
      await tracker.start(streamRef.current ?? undefined);
    }

    timerRef.current = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);

    if (speechTrackerRef.current) {
      await speechTrackerRef.current.stop();
    }
    const recording = await (recorderRef.current?.stop() ?? Promise.resolve(null));
    const sessionId = `sess-${crypto.randomUUID()}`;

    let finalTranscript = (transcript + ' ' + interimText).trim();
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
    } else {
      wordTimings = wordTimingsRef.current;
    }

    if (!finalTranscript) {
      setNoSpeech(true);
      return;
    }

    setIsAnalyzing(true);

    const evalInput = {
      mode: 'LIVE_COACH' as TrainingMode,
      contextPrompt: 'Live Speech Coaching & Real-time Evaluation',
      targetAudience: 'General Audience',
      transcript: finalTranscript,
      durationSeconds: Math.max(10, timerSeconds),
      wordTimings,
      previousAttemptSession
    };

    const evalResult = await evaluateSession(evalInput);
    const mediaUrl = recording ? (await api.uploadRecording(sessionId, recording)) ?? undefined : undefined;

    const attemptNum = previousAttemptSession ? previousAttemptSession.attemptNumber + 1 : 1;

    const newSession: Session = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      mode: 'LIVE_COACH',
      modeLabel: 'Live Coach Session',
      durationSeconds: Math.max(10, timerSeconds),
      contextPrompt: 'Live Speech Coaching',
      transcript: finalTranscript,
      score: evalResult.score,
      utterances: [
        {
          id: 'u-1',
          speaker: 'USER',
          timestamp: '00:00',
          text: finalTranscript,
          metrics: { paceWPM: paceWpm, fillerCount }
        }
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

    setIsAnalyzing(false);
    onSessionComplete(newSession);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="practice-layout">
      <header className="practice-header">
        <div>
          <p className="eyebrow">Live Coach</p>
          <h1>Speak with clarity</h1>
          <p>Use your camera and microphone while the coach measures pace and clarity.</p>
        </div>
        <div className="timer-card">
          <span className={isRecording ? 'live-dot is-live' : 'live-dot'} />
          <strong>{formatTimer(timerSeconds)}</strong>
        </div>
      </header>

      <div className="live-grid">
        <div className="camera-card">
          <video ref={videoRef} autoPlay playsInline muted />
          {!cameraActive && (
            <div className="camera-empty">
              <Video className="w-8 h-8" />
              <strong>Camera not available</strong>
              <span>Allow camera and microphone access to begin.</span>
            </div>
          )}
          {isRecording && (
            <div className="live-metrics">
              <span><Activity className="w-4 h-4" /> {paceWpm || 140} WPM</span>
              {fillerCount > 0 && <span><AlertCircle className="w-4 h-4" /> {fillerCount} fillers</span>}
              <span><Eye className="w-4 h-4" /> Lens</span>
            </div>
          )}
        </div>

        <aside className="coach-panel">
          <div>
            <p className="eyebrow">Live telemetry</p>
            <div className="volume-row">
              <span>Audio input</span><strong>{volume}%</strong>
            </div>
            <div className="volume-track"><div style={{ width: `${volume}%` }} /></div>
            <div className="stat-grid">
              <div><span>Filler words</span><strong>{fillerCount}</strong></div>
              <div><span>Speaking pace</span><strong>{paceWpm || 140}</strong></div>
            </div>
            <div className="live-transcript">
              <span>{offlineMode ? 'Local transcription' : 'Live transcript'}</span>
              <p>
                {offlineMode
                  ? 'Offline mode: your transcript and real coaching markers appear after you finish.'
                  : <>{transcript} <mark>{interimText}</mark></>}
              </p>
            </div>
          </div>
          {!isRecording ? (
            <button onClick={handleStartRecording} disabled={isAnalyzing} className="primary-action">
              <Mic className="w-5 h-5" /> Start session
            </button>
          ) : (
            <button onClick={handleStopRecording} className="stop-action">
              <Square className="w-5 h-5" /> Finish & analyze
            </button>
          )}
          {isAnalyzing && <p className="analyzing"><Sparkles className="w-4 h-4" /> Analyzing</p>}
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
        </aside>
      </div>
    </div>
  );
};
