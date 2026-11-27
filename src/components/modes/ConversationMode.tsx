import React, { useEffect, useRef, useState } from 'react';
import type { SavedConversation, Session, TrainingMode, Utterance, WordTiming } from '../../types';
import { evaluateSession, generateConversationReply } from '../../services/aiCoachService';
import { api } from '../../services/api';
import { RecognitionTimingTracker } from '../../services/wordTimingService';
import { History, Mic, MicOff, Send, Plus, Trash2 } from 'lucide-react';

interface Props {
  onSessionComplete: (session: Session) => void;
  previousAttemptSession?: Session | null;
}

const createId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const now = () => Date.now();

const createInitialMessage = (): Utterance => ({
  id: 'welcome',
  speaker: 'AI',
  timestamp: new Date().toISOString(),
  text: 'Hello. What would you like to talk about today?'
});

export const ConversationMode: React.FC<Props> = ({ onSessionComplete, previousAttemptSession }) => {
  const [utterances, setUtterances] = useState<Utterance[]>(() => [createInitialMessage()]);
  const [currentText, setCurrentText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [conversationId, setConversationId] = useState(() => `conversation-${crypto.randomUUID()}`);
  const [showHistory, setShowHistory] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceEnabledRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const wordTimingsRef = useRef<WordTiming[]>([]);
  const conversationStartedAtRef = useRef(now());

  useEffect(() => {
    api.getConversations().then(setConversations);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [utterances, isThinking]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    window.speechSynthesis?.cancel();
  }, []);

  const persistConversation = async (history: Utterance[]) => {
    const userMessage = history.find((item) => item.speaker === 'USER');
    const title = userMessage
      ? userMessage.text.slice(0, 48) + (userMessage.text.length > 48 ? '...' : '')
      : 'New conversation';
    const conversation: SavedConversation = {
      id: conversationId,
      title,
      updatedAt: new Date().toISOString(),
      utterances: history
    };

    await api.saveConversation(conversation);
    setConversations((items) => [
      conversation,
      ...items.filter((item) => item.id !== conversation.id)
    ]);
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) {
      if (voiceEnabledRef.current) startListening();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      if (voiceEnabledRef.current) startListening();
    };
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || isThinking) return;

    const userUtterance: Utterance = {
      id: createId('u'),
      speaker: 'USER',
      timestamp: new Date().toISOString(),
      text: cleanText
    };
    const withUser = [...utterances, userUtterance];
    setUtterances(withUser);
    setCurrentText('');
    setIsThinking(true);

    const reply = await generateConversationReply(cleanText, withUser);
    const aiUtterance: Utterance = {
      id: createId('a'),
      speaker: 'AI',
      timestamp: new Date().toISOString(),
      text: reply
    };
    const withReply = [...withUser, aiUtterance];
    setUtterances(withReply);
    setIsThinking(false);
    await persistConversation(withReply);
    speak(reply);
  };

  const startListening = async () => {
    window.speechSynthesis?.cancel();

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceEnabled(false);
      voiceEnabledRef.current = false;
      alert('Voice recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }

    recognitionRef.current?.stop();
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    const timingTracker = new RecognitionTimingTracker(
      (now() - conversationStartedAtRef.current) / 1000
    );
    let committed = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
      setIsListening(false);
    };
    recognition.onresult = (event: any) => {
      timingTracker.observe(event);
      let finalText = '';
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        else interimText += event.results[i][0].transcript;
      }
      setCurrentText(finalText || interimText);
      if (finalText.trim() && !committed) {
        committed = true;
        wordTimingsRef.current = [...wordTimingsRef.current, ...timingTracker.getTimings()];
        recognition.stop();
        void sendMessage(finalText);
      }
    };
    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error !== 'aborted' && event.error !== 'no-speech') console.warn(event.error);
    };
    recognition.start();
  };

  const toggleVoice = () => {
    const next = !voiceEnabled;
    setVoiceEnabled(next);
    voiceEnabledRef.current = next;
    if (next) {
      void startListening();
    } else {
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
      setIsListening(false);
    }
  };

  const startNewConversation = () => {
    window.speechSynthesis?.cancel();
    recognitionRef.current?.stop();
    setIsListening(false);
    setConversationId(`conversation-${crypto.randomUUID()}`);
    setUtterances([createInitialMessage()]);
    setCurrentText('');
    setShowHistory(false);
    wordTimingsRef.current = [];
    conversationStartedAtRef.current = now();
  };

  const loadConversation = (conversation: SavedConversation) => {
    setConversationId(conversation.id);
    setUtterances(conversation.utterances);
    setShowHistory(false);
  };

  const deleteConversation = async (conversationIdToDelete: string) => {
    await api.deleteConversation(conversationIdToDelete);
    setConversations((items) => items.filter((item) => item.id !== conversationIdToDelete));
  };

  const finishConversation = async () => {
    const fullTranscript = utterances.map((item) => `${item.speaker}: ${item.text}`).join('\n');
    const firstMessage = utterances[0];
    const startedAt = firstMessage ? new Date(firstMessage.timestamp).getTime() : now();
    const durationSeconds = Math.max(1, Math.round((now() - startedAt) / 1000));
    const result = await evaluateSession({
      mode: 'CONVERSATION' as TrainingMode,
      contextPrompt: 'Natural multi-turn conversation',
      transcript: fullTranscript,
      durationSeconds,
      wordTimings: wordTimingsRef.current,
      previousAttemptSession
    });
    onSessionComplete({
      id: `sess-${crypto.randomUUID()}`,
      timestamp: new Date().toISOString(),
      mode: 'CONVERSATION',
      modeLabel: 'Conversation',
      durationSeconds,
      contextPrompt: 'Natural multi-turn conversation',
      transcript: fullTranscript,
      score: result.score,
      utterances,
      metrics: result.metrics,
      replays: result.replays,
      whyCoaching: result.whyCoaching,
      attemptNumber: previousAttemptSession ? previousAttemptSession.attemptNumber + 1 : 1,
      previousAttemptId: previousAttemptSession?.id,
      deltas: result.deltas,
      oneThingToPractice: result.oneThingToPractice,
      evaluationSource: result.source,
      wordTimings: wordTimingsRef.current
    });
  };

  return (
    <div className="conversation-layout">
      {showHistory && (
        <aside className="conversation-history">
          <div className="history-header">
            <span>Recent conversations</span>
            <button onClick={startNewConversation} className="icon-button" title="New conversation">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="history-list">
            {conversations.map((conversation) => (
              <div key={conversation.id} className="history-item">
                <button onClick={() => loadConversation(conversation)} className="history-load">
                  <strong>{conversation.title}</strong>
                  <span>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
                </button>
                <button
                  onClick={() => void deleteConversation(conversation.id)}
                  className="history-delete"
                  title="Delete conversation"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="history-empty">Saved conversations will appear here.</p>
            )}
          </div>
        </aside>
      )}

      <section className="conversation-panel">
        <div className="conversation-header">
          <div>
            <p className="eyebrow">Conversation</p>
            <h1>Talk it through</h1>
          </div>
          <div className="conversation-actions">
            <button onClick={() => setShowHistory((value) => !value)} className="secondary-button">
              <History className="w-4 h-4" />
              <span>History</span>
            </button>
            <button onClick={finishConversation} className="secondary-button">
              Finish
            </button>
          </div>
        </div>

        <div className="chat-scroll">
          {utterances.map((utterance) => (
            <div key={utterance.id} className={`chat-row ${utterance.speaker === 'USER' ? 'chat-user' : 'chat-ai'}`}>
              <div className="chat-avatar">
                {utterance.speaker === 'USER' ? 'You' : 'Coach'}
              </div>
              <div className="chat-bubble">{utterance.text}</div>
            </div>
          ))}
          {isThinking && (
            <div className="chat-row chat-ai">
              <div className="chat-avatar">Coach</div>
              <div className="typing-bubble"><i /><i /><i /></div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="composer">
          <button
            onClick={toggleVoice}
            className={`voice-button ${voiceEnabled ? 'voice-active' : ''}`}
            title={voiceEnabled ? 'Turn voice mode off' : 'Turn voice mode on'}
          >
            {voiceEnabled ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>
          <input
            value={currentText}
            onChange={(event) => setCurrentText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && void sendMessage(currentText)}
            placeholder={isListening ? 'Listening...' : 'Write or say something...'}
          />
          <button
            onClick={() => void sendMessage(currentText)}
            className="send-button"
            disabled={!currentText.trim() || isThinking}
            title="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </section>
    </div>
  );
};
