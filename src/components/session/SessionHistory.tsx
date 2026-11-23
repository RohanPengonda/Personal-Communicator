import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Session, TrainingMode } from '../../types';
import { api } from '../../services/api';
import { exportRecording, exportSessionJson, exportTranscript } from '../../services/exportService';
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

type ModeFilter = 'ALL' | TrainingMode;
type SortBy = 'date' | 'score' | 'duration';

const PAGE_SIZE = 5;

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [page, setPage] = useState(1);
  const [storage, setStorage] = useState({ bytes: 0, count: 0, retentionDays: 0 });
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const loadSessions = async () => {
    const [items, info] = await Promise.all([api.getSessions(), api.getStorage()]);
    setSessions(items);
    setStorage(info);
  };

  useEffect(() => {
    void api.getSessions().then(setSessions);
    void api.getStorage().then(setStorage);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const items = sessions.filter((session) => {
      const matchesMode = modeFilter === 'ALL' || session.mode === modeFilter;
      const matchesQuery =
        !query ||
        session.transcript.toLowerCase().includes(query) ||
        session.modeLabel.toLowerCase().includes(query) ||
        session.contextPrompt.toLowerCase().includes(query);
      return matchesMode && matchesQuery;
    });

    return [...items].sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'duration') return b.durationSeconds - a.durationSeconds;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
  }, [sessions, search, modeFilter, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedId = requestedId && sessions.some((item) => item.id === requestedId)
    ? requestedId
    : (sessions[0]?.id ?? null);
  const selected = sessions.find((session) => session.id === selectedId) ?? null;

  const seekTo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    void video.play().catch(() => {});
  };

  const handleDelete = async (session: Session) => {
    if (!window.confirm('Delete this session and its recording?')) return;
    await api.deleteSession(session.id);
    await loadSessions();
  };

  const handleCleanup = async () => {
    const removed = await api.cleanupRecordings();
    await loadSessions();
    window.alert(removed > 0 ? `Removed ${removed} expired recording(s).` : 'No expired recordings.');
  };

  return (
    <div className="practice-layout">
      <header className="practice-header">
        <div>
          <p className="eyebrow">History</p>
          <h1>Review your sessions</h1>
          <p>Watch your recording, jump to a coaching marker, and read the transcript.</p>
          <p className="storage-line">
            {storage.count} recording{storage.count === 1 ? '' : 's'} · {formatBytes(storage.bytes)}
            {storage.retentionDays > 0 && ` · auto-clean after ${storage.retentionDays} days`}
            <button onClick={() => void handleCleanup()} className="link-button" title="Clean up now">
              <RefreshCw className="w-3 h-3" /> Clean up now
            </button>
          </p>
        </div>
        <History className="practice-header-icon" />
      </header>

      <div className="history-layout">
        <aside className="session-list">
          <div className="session-filters">
            <label className="search-field">
              <Search className="w-4 h-4" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search transcripts"
              />
            </label>
            <div className="filter-row">
              <select
                value={modeFilter}
                onChange={(event) => {
                  setModeFilter(event.target.value as ModeFilter);
                  setPage(1);
                }}
              >
                <option value="ALL">All modes</option>
                <option value="LIVE_COACH">Live Coach</option>
                <option value="CONVERSATION">Conversation</option>
                <option value="INTERVIEW">Interview</option>
              </select>
              <select
                value={sortBy}
                onChange={(event) => {
                  setSortBy(event.target.value as SortBy);
                  setPage(1);
                }}
              >
                <option value="date">Newest</option>
                <option value="score">Top score</option>
                <option value="duration">Longest</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 && (
            <p className="history-empty">No sessions match these filters.</p>
          )}
          {paged.map((session) => (
            <button
              key={session.id}
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
          ))}

          {filtered.length > PAGE_SIZE && (
            <div className="pager">
              <button
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage === 1}
                title="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span>Page {currentPage} of {pageCount}</span>
              <button
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                disabled={currentPage === pageCount}
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

              <div className="session-detail-actions">
                {selected.mediaUrl && (
                  <button
                    onClick={() => void exportRecording(selected).catch(() => alert('Could not download the video.'))}
                    className="secondary-button"
                  >
                    <Download className="w-4 h-4" /> Video
                  </button>
                )}
                <button onClick={() => exportTranscript(selected)} className="secondary-button">
                  <FileText className="w-4 h-4" /> Transcript
                </button>
                <button onClick={() => exportSessionJson(selected)} className="secondary-button">
                  <FileJson className="w-4 h-4" /> JSON
                </button>
                <button onClick={() => void handleDelete(selected)} className="secondary-button danger-button">
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
    </div>
  );
};
