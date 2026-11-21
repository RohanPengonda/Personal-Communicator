import React from 'react';
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
