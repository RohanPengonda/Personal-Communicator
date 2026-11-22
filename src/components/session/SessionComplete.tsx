import React, { useRef } from 'react';
import type { Session } from '../../types';
import { RotateCcw, CheckCircle2, Target } from 'lucide-react';

interface SessionCompleteProps {
  session: Session;
  onRetry: () => void;
  onDone: () => void;
}

export const SessionComplete: React.FC<SessionCompleteProps> = ({
  session,
  onRetry,
  onDone
}) => {
  const metrics = session.metrics;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => {});
  };

  const formatTime = (seconds: number) => {
    const value = Math.max(0, Math.round(seconds));
    return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
  };

  return (
    <div className="result-layout">
      <header className="result-header">
        <div>
          <p className="eyebrow">Session complete</p>
          <h1>{session.modeLabel}</h1>
          <p>{session.contextPrompt}</p>
        </div>
        <div className="result-score">
          <span>Overall</span>
          <strong>{session.score.toFixed(1)}</strong>
          <small>/ 10</small>
        </div>
      </header>

      {session.mediaUrl && (
        <section className="result-replay">
          <video ref={videoRef} controls src={session.mediaUrl} />
          {session.replays.length > 0 && (
            <div className="result-replay-markers">
              <p className="eyebrow">Jump to a moment</p>
              <div>
                {session.replays.map((marker) => (
                  <button key={marker.id} onClick={() => seekTo(marker.timestampSeconds)}>
                    <span>{formatTime(marker.timestampSeconds)}</span>
                    <strong>{marker.label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="result-focus">
        <div className="result-focus-icon"><Target className="w-5 h-5" /></div>
        <div>
          <span>One thing to practice</span>
          <strong>{session.oneThingToPractice}</strong>
        </div>
      </section>

      <section className="result-metrics">
        {[
          ['Clarity', metrics.clarity],
          ['Confidence', metrics.confidence],
          ['Engagement', metrics.engagement],
          ['Structure', metrics.structure],
          ['Conciseness', metrics.conciseness]
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>{Number(value).toFixed(1)}</strong>
          </div>
        ))}
      </section>

      {session.whyCoaching.length > 0 && (
        <section className="result-coaching">
          <div className="result-section-title">
            <CheckCircle2 className="w-5 h-5" />
            <span>Coach feedback</span>
          </div>
          {session.whyCoaching.slice(0, 2).map((card) => (
            <article key={card.id}>
              <strong>{card.principle}</strong>
              <p>{card.observation}</p>
              <p>{card.exemplarReframing}</p>
            </article>
          ))}
        </section>
      )}

      <footer className="result-actions">
        <button onClick={onDone} className="secondary-button">Done</button>
        <button onClick={onRetry} className="primary-action">
          <RotateCcw className="w-4 h-4" />
          Try again
        </button>
      </footer>
    </div>
  );
};
