import React, { useEffect, useMemo, useState } from 'react';
import type { Session, TrainingMode } from '../../types';
import { api } from '../../services/api';
import { TrendingUp, BarChart3, ArrowUpRight, ArrowDownRight, Target } from 'lucide-react';

const MODE_LABELS: Record<TrainingMode, string> = {
  LIVE_COACH: 'Live Coach',
  CONVERSATION: 'Conversation',
  INTERVIEW: 'Interview'
};

const METRICS: [string, keyof Session['metrics']][] = [
  ['Clarity', 'clarity'],
  ['Confidence', 'confidence'],
  ['Engagement', 'engagement'],
  ['Structure', 'structure'],
  ['Conciseness', 'conciseness'],
  ['Storytelling', 'storytelling']
];

const formatDate = (value: string) => new Date(value).toLocaleDateString(undefined, {
  month: 'short',
  day: 'numeric'
});

export const ProgressDashboard: React.FC = () => {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    api.getSessions().then(setSessions);
  }, []);

  const trend = useMemo(
    () => [...sessions]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .slice(-12),
    [sessions]
  );

  const summary = useMemo(() => {
    const scores = sessions.map((session) => session.score);
    const average = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
    const newest = sessions.reduce(
      (latest, session) => Math.max(latest, new Date(session.timestamp).getTime()),
      0
    );
    const weekAgo = newest - 7 * 24 * 60 * 60 * 1000;
    return {
      total: sessions.length,
      average,
      best: scores.length ? Math.max(...scores) : 0,
      recent: newest ? sessions.filter((session) => new Date(session.timestamp).getTime() >= weekAgo).length : 0
    };
  }, [sessions]);

  const averages = useMemo(
    () => METRICS.map(([label, key]) => ({
      label,
      value: sessions.length
        ? sessions.reduce((sum, session) => sum + Number(session.metrics[key] || 0), 0) / sessions.length
        : 0
    })),
    [sessions]
  );

  const comparisons = useMemo(() => {
    const byMode: Partial<Record<TrainingMode, Session[]>> = {};
    sessions.forEach((session) => {
      const list = byMode[session.mode] ?? [];
      list.push(session);
      byMode[session.mode] = list;
    });

    const results: { session: Session; previous: Session; change: number; pct: number }[] = [];
    (Object.keys(byMode) as TrainingMode[]).forEach((mode) => {
      const list = (byMode[mode] ?? [])
        .slice()
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      for (let index = 0; index < Math.min(3, list.length - 1); index += 1) {
        const session = list[index];
        const previous = list[index + 1];
        results.push({
          session,
          previous,
          change: session.score - previous.score,
          pct: previous.score ? Math.round(((session.score - previous.score) / previous.score) * 100) : 0
        });
      }
    });

    return results
      .sort((a, b) => new Date(b.session.timestamp).getTime() - new Date(a.session.timestamp).getTime())
      .slice(0, 6);
  }, [sessions]);

  const chartPoints = trend.map((session, index) => {
    const x = trend.length === 1 ? 260 : (index / (trend.length - 1)) * 520;
    const y = 140 - (Math.min(10, Math.max(0, session.score)) / 10) * 130 - 5;
    return { x, y, session };
  });

  return (
    <div className="practice-layout">
      <header className="practice-header">
        <div>
          <p className="eyebrow">Progress</p>
          <h1>Track your improvement</h1>
          <p>Scores, strengths, and what changed between attempts.</p>
        </div>
        <TrendingUp className="practice-header-icon" />
      </header>

      {sessions.length === 0 ? (
        <div className="media-empty">Finish a practice session to start tracking progress.</div>
      ) : (
        <div className="progress-layout">
          <section className="progress-summary">
            <div><span>Sessions</span><strong>{summary.total}</strong></div>
            <div><span>Average score</span><strong>{summary.average.toFixed(1)}</strong></div>
            <div><span>Best score</span><strong>{summary.best.toFixed(1)}</strong></div>
            <div><span>Last 7 days</span><strong>{summary.recent}</strong></div>
          </section>

          <section className="progress-card">
            <div className="result-section-title">
              <TrendingUp className="w-4 h-4" />
              <span>Score trend (last {trend.length} sessions)</span>
            </div>
            <svg className="progress-chart" viewBox="0 0 520 140" preserveAspectRatio="none">
              {[2, 4, 6, 8].map((level) => (
                <line key={level} x1="0" x2="520" y1={140 - level * 13 - 5} y2={140 - level * 13 - 5} />
              ))}
              {chartPoints.length > 1 && (
                <polyline points={chartPoints.map((point) => `${point.x},${point.y}`).join(' ')} />
              )}
              {chartPoints.map((point) => (
                <circle key={point.session.id} cx={point.x} cy={point.y} r="4">
                  <title>{`${formatDate(point.session.timestamp)} — ${point.session.score.toFixed(1)}`}</title>
                </circle>
              ))}
            </svg>
            <div className="chart-labels">
              <span>{chartPoints[0] ? formatDate(chartPoints[0].session.timestamp) : ''}</span>
              <span>{chartPoints.length ? formatDate(chartPoints[chartPoints.length - 1].session.timestamp) : ''}</span>
            </div>
          </section>

          <section className="progress-card">
            <div className="result-section-title">
              <BarChart3 className="w-4 h-4" />
              <span>Average metric scores</span>
            </div>
            <div className="metric-bars">
              {averages.map((metric) => (
                <div key={metric.label}>
                  <span>{metric.label}</span>
                  <div className="metric-track"><div style={{ width: `${metric.value * 10}%` }} /></div>
                  <strong>{metric.value.toFixed(1)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="progress-card">
            <div className="result-section-title">
              <Target className="w-4 h-4" />
              <span>Attempt-to-attempt changes</span>
            </div>
            {comparisons.length === 0 && <p className="history-empty">Practice the same mode twice to see changes.</p>}
            <div className="comparison-grid">
              {comparisons.map(({ session, previous, change, pct }) => (
                <article key={session.id}>
                  <div>
                    <strong>{MODE_LABELS[session.mode]}</strong>
                    <span>{formatDate(session.timestamp)}</span>
                  </div>
                  <div className="comparison-score">
                    <strong>{previous.score.toFixed(1)}</strong>
                    <span>→</span>
                    <strong>{session.score.toFixed(1)}</strong>
                    <em className={change >= 0 ? 'positive' : 'negative'}>
                      {change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {pct >= 0 ? '+' : ''}{pct}%
                    </em>
                  </div>
                  {session.deltas && (
                    <small>
                      Clarity {session.deltas.clarityChangePct >= 0 ? '+' : ''}{session.deltas.clarityChangePct}% ·
                      Fillers {session.deltas.fillerReductionPct >= 0 ? '+' : ''}{session.deltas.fillerReductionPct}%
                    </small>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
