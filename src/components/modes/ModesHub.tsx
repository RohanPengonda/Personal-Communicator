import React from 'react';
import type { Session, TrainingMode } from '../../types';
import { LiveCoachMode } from './LiveCoachMode';
import { ConversationMode } from './ConversationMode';
import { InterviewMode } from './InterviewMode';

interface ModesHubProps {
  onSessionComplete: (session: Session) => void;
  activeMode: TrainingMode | null;
  onClearActiveMode: () => void;
}

export const ModesHub: React.FC<ModesHubProps> = ({ onSessionComplete, activeMode }) => {
  if (activeMode === 'CONVERSATION') {
    return <ConversationMode onSessionComplete={onSessionComplete} />;
  }

  if (activeMode === 'INTERVIEW') {
    return <InterviewMode onSessionComplete={onSessionComplete} />;
  }

  return <LiveCoachMode onSessionComplete={onSessionComplete} />;
};
