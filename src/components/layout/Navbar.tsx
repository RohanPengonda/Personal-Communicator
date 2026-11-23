import React from 'react';
import { MessageSquare, Mic2, BriefcaseBusiness, History, TrendingUp, Cloud, CloudOff } from 'lucide-react';

export type ActiveTab = 'LIVE_COACH' | 'CONVERSATION' | 'INTERVIEW' | 'HISTORY' | 'PROGRESS';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  offlineMode: boolean;
  onToggleOffline: () => void;
}

const tabs = [
  { id: 'LIVE_COACH' as const, label: 'Live Coach', icon: Mic2 },
  { id: 'CONVERSATION' as const, label: 'Conversation', icon: MessageSquare },
  { id: 'INTERVIEW' as const, label: 'Interview', icon: BriefcaseBusiness },
  { id: 'HISTORY' as const, label: 'History', icon: History },
  { id: 'PROGRESS' as const, label: 'Progress', icon: TrendingUp }
];

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, offlineMode, onToggleOffline }) => (
  <header className="app-header">
    <div className="app-header-inner">
      <div className="flex items-center gap-3 shrink-0">
        <div className="brand-mark">
          <Mic2 className="w-5 h-5" />
        </div>
        <span className="brand-name">Communication Coach</span>
      </div>

      <div className="flex items-center gap-2">
        <nav className="flex items-center gap-1" aria-label="Practice modes">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === id
                  ? 'bg-emerald-500 text-surface-950'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
        <button
          onClick={onToggleOffline}
          title={offlineMode ? 'Offline mode: local Whisper transcription' : 'Online mode: browser speech recognition'}
          className={`flex items-center gap-1 px-2 py-2 rounded-lg text-xs font-semibold transition-colors ${
            offlineMode ? 'bg-emerald-500 text-surface-950' : 'text-slate-300 hover:text-white hover:bg-white/5'
          }`}
        >
          {offlineMode ? <CloudOff className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
          <span className="hidden lg:inline">{offlineMode ? 'Offline' : 'Online'}</span>
        </button>
      </div>
    </div>
  </header>
);
