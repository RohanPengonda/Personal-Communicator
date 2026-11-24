import React, { useEffect, useMemo, useState } from 'react';
import type { ProgressStats, TrainingMode } from '../../types';
import { api } from '../../services/api';
import { TrendingUp, BarChart3, ArrowUpRight, ArrowDownRight, Target } from 'lucide-react';

const EMPTY_STATS: ProgressStats = {
  summary: { total: 0, average: 0, best: 0, recent: 0 },
  trend: [],
  averages: {},
  comparisons: []
};

const MODE_LABELS: Record<TrainingMode, string> = {
  LIVE_COACH: 'Live Coach',
  CONVERSATION: 'Conversation',
  INTERVIEW: 'Interview'
};

const METRICS: [string, string][] = [
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
  const [stats, setStats] = useState<ProgressStats>(EMPTY_STATS);

  useEffect(() => {
    void api.getProgressStats().then(setStats);
  }, []);

  const chartPoints = useMemo(() => stats.trend.map((point, index) => ({
    x: stats.trend.length === 1 ? 260 : (index / (stats.trend.length - 1)) * 520,
    y: 140 - (Math.min(10, Math.max(0, point.score)) / 10) * 130 - 5,
    point
  })), [stats.trend]);

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

      {stats.summary.total === 0 ? (
        <div className="media-empty">Finish a practice session to start tracking progress.</div>
      ) : (
        <div className="progress-layout">
          <section className="progress-summary">
            <div><span>Sessions</span><strong>{stats.summary.total}</strong></div>
            <div><span>Average score</span><strong>{stats.summary.average.toFixed(1)}</strong></div>
            <div><span>Best score</span><strong>{stats.summary.best.toFixed(1)}</strong></div>
            <div><span>Last 7 days</span><strong>{stats.summary.recent}</strong></div>
          </section>

          <section className="progress-card">
            <div className="result-section-title">
              <TrendingUp className="w-4 h-4" />
              <span>Score trend (last {chartPoints.length} sessions)</span>
            </div>
            <svg className="progress-chart" viewBox="0 0 520 140" preserveAspectRatio="none">
              {[2, 4, 6, 8].map((level) => (
                <line key={level} x1="0" x2="520" y1={140 - level * 13 - 5} y2={140 - level * 13 - 5} />
              ))}
              {chartPoints.length > 1 && (
                <polyline points={chartPoints.map((point) => `${point.x},${point.y}`).join(' ')} />
              )}
              {chartPoints.map(({ x, y, point }) => (
                <circle key={point.id} cx={x} cy={y} r="4">
                  <title>{`${formatDate(point.timestamp)} — ${point.score.toFixed(1)}`}</title>
                </circle>
              ))}
            </svg>
            <div className="chart-labels">
              <span>{chartPoints[0] ? formatDate(chartPoints[0].point.timestamp) : ''}</span>
              <span>{chartPoints.length ? formatDate(chartPoints[chartPoints.length - 1].point.timestamp) : ''}</span>
            </div>
          </section>

          <section className="progress-card">
            <div className="result-section-title">
              <BarChart3 className="w-4 h-4" />
              <span>Average metric scores</span>
            </div>
            <div className="metric-bars">
              {METRICS.map(([label, key]) => {
                const value = stats.averages[key] ?? 0;
                return (
                  <div key={label}>
                    <span>{label}</span>
                    <div className="metric-track"><div style={{ width: `${value * 10}%` }} /></div>
                    <strong>{value.toFixed(1)}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="progress-card">
            <div className="result-section-title">
              <Target className="w-4 h-4" />
              <span>Attempt-to-attempt changes</span>
            </div>
            {stats.comparisons.length === 0 && <p className="history-empty">Practice the same mode twice to see changes.</p>}
            <div className="comparison-grid">
              {stats.comparisons.map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{MODE_LABELS[item.mode]}</strong>
                    <span>{formatDate(item.timestamp)}</span>
                  </div>
                  <div className="comparison-score">
                    <strong>{item.previousScore.toFixed(1)}</strong>
                    <span>→</span>
                    <strong>{item.score.toFixed(1)}</strong>
                    <em className={item.changePct >= 0 ? 'positive' : 'negative'}>
                      {item.changePct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {item.changePct >= 0 ? '+' : ''}{item.changePct}%
                    </em>
                  </div>
                  {item.deltas && (
                    <small>
                      Clarity {item.deltas.clarityChangePct >= 0 ? '+' : ''}{item.deltas.clarityChangePct}% ·
                      Fillers {item.deltas.fillerReductionPct >= 0 ? '+' : ''}{item.deltas.fillerReductionPct}%
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
