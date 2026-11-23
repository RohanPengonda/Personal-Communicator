import React, { useEffect, useState } from 'react';
import type { Session, TrainingMode } from './types';
import { Navbar, type ActiveTab } from './components/layout/Navbar';
import { ModesHub } from './components/modes/ModesHub';
import { SessionComplete } from './components/session/SessionComplete';
import { SessionHistory } from './components/session/SessionHistory';
import { ProgressDashboard } from './components/session/ProgressDashboard';
import { api } from './services/api';
import { getOfflineMode, setOfflineMode } from './services/settings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('LIVE_COACH');
  const [completedSession, setCompletedSession] = useState<Session | null>(null);
  const [activeMode, setActiveMode] = useState<TrainingMode | null>('LIVE_COACH');
  const [offlineMode, setOfflineModeState] = useState(getOfflineMode);
  const [lastSessions, setLastSessions] = useState<Partial<Record<TrainingMode, Session>>>({});

  useEffect(() => {
    api.getSessions().then((items) => {
      const latest: Partial<Record<TrainingMode, Session>> = {};
      items.forEach((session) => {
        if (!latest[session.mode]) latest[session.mode] = session;
      });
      setLastSessions(latest);
    });
  }, []);

  const toggleOffline = () => {
    setOfflineModeState((current) => {
      setOfflineMode(!current);
      return !current;
    });
  };

  const selectTab = (tab: ActiveTab) => {
    setCompletedSession(null);
    setActiveTab(tab);
    setActiveMode(tab === 'HISTORY' || tab === 'PROGRESS' ? null : tab);
  };

  const handleSessionComplete = async (session: Session) => {
    await api.saveSession(session);
    setLastSessions((current) => ({ ...current, [session.mode]: session }));
    setCompletedSession(session);
  };

  return (
    <div className="app-shell">
      <Navbar
        activeTab={activeTab}
        setActiveTab={selectTab}
        offlineMode={offlineMode}
        onToggleOffline={toggleOffline}
      />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 lg:px-8 py-6">
        {activeTab === 'HISTORY' ? (
          <SessionHistory onPractice={(mode) => selectTab(mode)} />
        ) : activeTab === 'PROGRESS' ? (
          <ProgressDashboard />
        ) : completedSession ? (
          <SessionComplete
            session={completedSession}
            onRetry={() => setCompletedSession(null)}
            onDone={() => setCompletedSession(null)}
          />
        ) : (
          <ModesHub
            activeMode={activeMode}
            onClearActiveMode={() => setActiveMode(null)}
            onSessionComplete={handleSessionComplete}
            previousAttemptSession={activeMode ? lastSessions[activeMode] ?? null : null}
            offlineMode={offlineMode}
          />
        )}
      </main>

    </div>
  );
};

export default App;
