import React, { useEffect, useRef, useState } from 'react';
import type { Session, TrainingMode } from '../../types';
import { api } from '../../services/api';
import { History, Video } from 'lucide-react';

interface SessionHistoryProps {
  onPractice: (mode: TrainingMode) => void;
}

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
};

export const SessionHistory: React.FC<SessionHistoryProps> = ({ onPractice }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    api.getSessions().then((items) => {
      setSessions(items);
      setSelectedId(items[0]?.id ?? null);
    });
  }, []);

  const selected = sessions.find((session) => session.id === selectedId) ?? null;

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => {});
  };

  return (
    <div className="practice-layout">
      <header className="practice-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>Review your sessions</h1>
          <p>Watch your recording, jump to a coaching marker, and read the transcript.</p>
        </div>
        <History className="practice-header-icon" />
      </header>

      <div className="history-layout">
        <aside className="session-list">
          <p className="eyebrow">Recent sessions</p>
          {sessions.length === 0 && (
            <p className="history-empty">No sessions saved yet. Finish a practice session to see it here.</p>
          )}
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => setSelectedId(session.id)}
              className={session.id === selectedId ? 'session-item session-active' : 'session-item'}
            >
              <strong>{session.modeLabel}</strong>
              <span>{new Date(session.timestamp).toLocaleString()}</span>
              <span>
                {session.score.toFixed(1)}/10 · {formatTime(session.durationSeconds)}
                {session.mediaUrl ? ' · video' : ''}
              </span>
            </button>
          ))}
        </aside>

        <section className="session-detail">
          {!selected ? (
            <div className="media-empty">Select a session to review it.</div>
          ) : (
            <>
              {selected.mediaUrl ? (
                <video ref={videoRef} className="session-video" controls src={selected.mediaUrl} />
              ) : (
                <div className="media-empty">
                  <Video className="w-7 h-7" />
                  <strong>No video for this session</strong>
                  <span>The transcript and coaching notes are still available below.</span>
                </div>
              )}

              <div className="replay-list">
                <p className="eyebrow">Coaching markers</p>
                {(selected.replays ?? []).length === 0 && <p className="history-empty">No markers saved.</p>}
                {(selected.replays ?? []).map((marker) => (
                  <button
                    key={marker.id}
                    onClick={() => seekTo(marker.timestampSeconds)}
                    disabled={!selected.mediaUrl}
                    className="replay-marker"
                  >
                    <span className="replay-time">{formatTime(marker.timestampSeconds)}</span>
                    <span>
                      <strong>{marker.label}</strong>
                      <small>{marker.advice}</small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="session-section">
                <p className="eyebrow">Transcript</p>
                <p className="session-transcript">{selected.transcript}</p>
              </div>

              {(selected.whyCoaching ?? []).length > 0 && (
                <div className="session-section">
                  <p className="eyebrow">Coach feedback</p>
                  {selected.whyCoaching.map((card) => (
                    <div key={card.id} className="session-feedback">
                      <strong>{card.principle}</strong>
                      <p>{card.observation}</p>
                      <p>{card.exemplarReframing}</p>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => onPractice(selected.mode)} className="secondary-button session-practice">
                Practice this mode again
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
