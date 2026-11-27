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
}

export const ModesHub: React.FC<ModesHubProps> = ({
  activeMode,
  onSessionComplete,
  previousAttemptSession
}) => {
  if (activeMode === 'CONVERSATION') {
    return (
      <ConversationMode
        onSessionComplete={onSessionComplete}
        previousAttemptSession={previousAttemptSession}
      />
    );
  }

  if (activeMode === 'INTERVIEW') {
    return (
      <InterviewMode
        onSessionComplete={onSessionComplete}
        previousAttemptSession={previousAttemptSession}
      />
    );
  }

  return (
    <LiveCoachMode
      onSessionComplete={onSessionComplete}
      previousAttemptSession={previousAttemptSession}
    />
  );
};
