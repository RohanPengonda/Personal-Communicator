import React from 'react';
import type { Session, TrainingMode } from '../../types';
import { LiveCoachMode } from './LiveCoachMode';
import { ConversationMode } from './ConversationMode';
import { InterviewMode } from './InterviewMode';

interface ModesHubProps {
  onSessionComplete: (session: Session) => void;
  activeMode: TrainingMode | null;
  onClearActiveMode: () => void;
  previousAttemptSession?: Session | null;
  offlineMode: boolean;
}

export const ModesHub: React.FC<ModesHubProps> = ({
  activeMode,
  onSessionComplete,
  previousAttemptSession,
  offlineMode
}) => {
  if (activeMode === 'CONVERSATION') {
    return (
      <ConversationMode
        onSessionComplete={onSessionComplete}
        previousAttemptSession={previousAttemptSession}
        offlineMode={offlineMode}
      />
    );
  }

  if (activeMode === 'INTERVIEW') {
    return (
      <InterviewMode
        onSessionComplete={onSessionComplete}
        previousAttemptSession={previousAttemptSession}
        offlineMode={offlineMode}
      />
    );
  }

  return (
    <LiveCoachMode
      onSessionComplete={onSessionComplete}
      previousAttemptSession={previousAttemptSession}
      offlineMode={offlineMode}
    />
  );
};
