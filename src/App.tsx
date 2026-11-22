import React, { useState } from 'react';
import type { Session, TrainingMode } from './types';
import { Navbar, type ActiveTab } from './components/layout/Navbar';
import { ModesHub } from './components/modes/ModesHub';
import { SessionComplete } from './components/session/SessionComplete';
import { SessionHistory } from './components/session/SessionHistory';
import { api } from './services/api';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('LIVE_COACH');
  const [completedSession, setCompletedSession] = useState<Session | null>(null);
  const [activeMode, setActiveMode] = useState<TrainingMode | null>('LIVE_COACH');

  const selectTab = (tab: ActiveTab) => {
    setCompletedSession(null);
    setActiveTab(tab);
    setActiveMode(tab === 'HISTORY' ? null : tab);
  };

  const handleSessionComplete = async (session: Session) => {
    await api.saveSession(session);
    setCompletedSession(session);
  };

  return (
    <div className="app-shell">
      <Navbar activeTab={activeTab} setActiveTab={selectTab} />

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 lg:px-8 py-6">
        {activeTab === 'HISTORY' ? (
          <SessionHistory onPractice={(mode) => selectTab(mode)} />
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
          />
        )}
      </main>

    </div>
  );
};

export default App;
