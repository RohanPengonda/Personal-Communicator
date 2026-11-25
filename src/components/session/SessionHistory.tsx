import React, { useEffect, useMemo, useState } from 'react';
import type { SessionPage, SessionQuery, TrainingMode } from '../../types';
import { api } from '../../services/api';
import { exportRecording, exportSessionJson, exportTranscript } from '../../services/exportService';
import { withAuth } from '../../services/auth';
import { InterviewReview } from './InterviewReview';
import {
  History,
  Video,
  Search,
  Trash2,
  Download,
  FileText,
  FileJson,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface SessionHistoryProps {
  onPractice: (mode: TrainingMode) => void;
}

const EMPTY_PAGE: SessionPage = { items: [], total: 0, page: 1, pageSize: 5, pageCount: 1 };

type ConfirmState = { ids: string[]; title: string; body: string };

const formatTime = (seconds: number) => {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const SessionHistory: React.FC<SessionHistoryProps> = ({ onPractice }) => {
  const [query, setQuery] = useState<SessionQuery>({ search: '', mode: 'ALL', sortBy: 'date', page: 1, pageSize: 5 });
  const [result, setResult] = useState<SessionPage>(EMPTY_PAGE);
  const [storage, setStorage] = useState({ bytes: 0, count: 0, retentionDays: 0 });
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [notice, setNotice] = useState('');
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    void api.getSessions(query).then(setResult);
    void api.getStorage().then(setStorage);
  }, [query]);

  const reload = () => {
    void api.getSessions(query).then(setResult);
    void api.getStorage().then(setStorage);
  };

  const selectedId = useMemo(
    () => requestedId && result.items.some((item) => item.id === requestedId)
      ? requestedId
      : (result.items[0]?.id ?? null),
    [requestedId, result.items]
  );
  const selected = result.items.find((item) => item.id === selectedId) ?? null;

  const changeQuery = (changes: Partial<SessionQuery>) => {
    setQuery((current) => ({ ...current, ...changes, page: changes.page ?? 1 }));
  };

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => {});
  };

  const runDelete = async () => {
    if (!confirm) return;
    const ids = confirm.ids;
    const deleted = ids.length === 1
      ? await api.deleteSession(ids[0])
        ? 1 : 0
      : await api.deleteSessions(ids);
    setConfirm(null);
    setChecked((current) => current.filter((id) => !ids.includes(id)));
    setNotice(`${deleted} session${deleted === 1 ? '' : 's'} deleted.`);
    reload();
  };

  const handleCleanup = async () => {
    const removed = await api.cleanupRecordings();
    setNotice(removed > 0 ? `Removed ${removed} expired recording(s).` : 'No expired recordings.');
    reload();
  };

  const toggleChecked = (id: string) => {
    setChecked((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id]);
  };

  return (
    <div className="practice-layout">
      <header className="practice-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>Review your sessions</h1>
          <p>Watch your recording, jump to a coaching marker, and read the transcript.</p>
          <p className="storage-line">
            {result.total} session{result.total === 1 ? '' : 's'} · {storage.count} recording{storage.count === 1 ? '' : 's'} · {formatBytes(storage.bytes)}
            {storage.retentionDays > 0 && ` · auto-clean after ${storage.retentionDays} days`}
            <button onClick={() => void handleCleanup()} className="link-button" title="Clean up now">
              <RefreshCw className="w-3 h-3" /> Clean up now
            </button>
          </p>
          {notice && <p className="history-notice">{notice}</p>}
        </div>
        <History className="practice-header-icon" />
      </header>

      <div className="history-layout">
        <aside className="session-list">
          <div className="session-filters">
            <label className="search-field">
              <Search className="w-4 h-4" />
              <input
                value={query.search}
                onChange={(event) => changeQuery({ search: event.target.value })}
                placeholder="Search transcripts"
              />
            </label>
            <div className="filter-row">
              <select
                value={query.mode}
                onChange={(event) => changeQuery({ mode: event.target.value as SessionQuery['mode'] })}
              >
                <option value="ALL">All modes</option>
                <option value="LIVE_COACH">Live Coach</option>
                <option value="CONVERSATION">Conversation</option>
                <option value="INTERVIEW">Interview</option>
              </select>
              <select
                value={query.sortBy}
                onChange={(event) => changeQuery({ sortBy: event.target.value as SessionQuery['sortBy'] })}
              >
                <option value="date">Newest</option>
                <option value="score">Top score</option>
                <option value="duration">Longest</option>
              </select>
            </div>
          </div>

          {checked.length > 0 && (
            <div className="bulk-bar">
              <span>{checked.length} selected</span>
              <button
                onClick={() => setConfirm({
                  ids: checked,
                  title: `Delete ${checked.length} sessions?`,
                  body: 'Their recordings will be removed too. This cannot be undone.'
                })}
                className="secondary-button danger-button"
              >
                <Trash2 className="w-4 h-4" /> Delete selected
              </button>
              <button onClick={() => setChecked([])} className="link-button">Clear</button>
            </div>
          )}

          {result.items.length === 0 && <p className="history-empty">No sessions match these filters.</p>}
          {result.items.map((session) => (
            <div key={session.id} className="session-item-row">
              <input
                type="checkbox"
                checked={checked.includes(session.id)}
                onChange={() => toggleChecked(session.id)}
                aria-label={`Select ${session.modeLabel} session`}
              />
              <button
                onClick={() => setRequestedId(session.id)}
                className={session.id === selectedId ? 'session-item session-active' : 'session-item'}
              >
                <strong>{session.modeLabel}</strong>
                <span>{new Date(session.timestamp).toLocaleString()}</span>
                <span>
                  {session.score.toFixed(1)}/10 · {formatTime(session.durationSeconds)}
                  {session.mediaUrl ? ' · video' : ''}
                </span>
              </button>
            </div>
          ))}

          {result.pageCount > 1 && (
            <div className="pager">
              <button
                onClick={() => changeQuery({ page: result.page - 1 })}
                disabled={result.page <= 1}
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {result.page} of {result.pageCount}</span>
              <button
                onClick={() => changeQuery({ page: result.page + 1 })}
                disabled={result.page >= result.pageCount}
                title="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </aside>

        <section className="session-detail">
          {!selected ? (
            <div className="media-empty">Select a session to review it.</div>
          ) : (
            <>
              <div className="session-detail-header">
                <div>
                  <p className="eyebrow">{selected.modeLabel}</p>
                  <strong>{new Date(selected.timestamp).toLocaleString()}</strong>
                </div>
                {selected.evaluationSource && (
                  <span
                    className={
                      selected.evaluationSource === 'AI' ? 'source-badge source-ai' : 'source-badge source-mock'
                    }
                  >
                    {selected.evaluationSource === 'AI' ? 'Gemini AI feedback' : 'Local mock feedback'}
                  </span>
                )}
              </div>

              {selected.mediaUrl ? (
                <video ref={videoRef} className="session-video" controls src={withAuth(selected.mediaUrl)} />
              ) : (
                <div className="media-empty">
                  <Video className="w-7 h-7" />
                  <strong>No video for this session</strong>
                  <span>The transcript and coaching notes are still available below.</span>
                </div>
              )}

              <div className="replay-list">
                <p className="eyebrow">Coaching markers</p>
                {selected.replays.length === 0 && <p className="history-empty">No markers saved.</p>}
                {selected.replays.map((marker) => (
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

              {selected.whyCoaching.length > 0 && (
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

              <InterviewReview session={selected} />

              <div className="session-detail-actions">
                {selected.mediaUrl && (
                  <button onClick={() => exportRecording(selected)} className="secondary-button">
                    <Download className="w-4 h-4" /> Video
                  </button>
                )}
                <button onClick={() => exportTranscript(selected)} className="secondary-button">
                  <FileText className="w-4 h-4" /> Transcript
                </button>
                <button onClick={() => exportSessionJson(selected)} className="secondary-button">
                  <FileJson className="w-4 h-4" /> JSON
                </button>
                <button
                  onClick={() => setConfirm({
                    ids: [selected.id],
                    title: 'Delete this session?',
                    body: 'Its recording, transcript and feedback will be removed. This cannot be undone.'
                  })}
                  className="secondary-button danger-button"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
                <button onClick={() => onPractice(selected.mode)} className="primary-action session-practice">
                  Practice again
                </button>
              </div>
            </>
          )}
        </section>
      </div>

      {confirm && (
        <div className="modal-backdrop" onClick={() => setConfirm(null)}>
          <div className="confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h2>{confirm.title}</h2>
            <p>{confirm.body}</p>
            <div className="confirm-actions">
              <button onClick={() => setConfirm(null)} className="secondary-button">Cancel</button>
              <button onClick={() => void runDelete()} className="secondary-button danger-button">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
