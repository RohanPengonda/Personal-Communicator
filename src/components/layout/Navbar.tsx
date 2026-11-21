import React from 'react';
import { MessageSquare, Mic2, BriefcaseBusiness } from 'lucide-react';

export type ActiveTab = 'LIVE_COACH' | 'CONVERSATION' | 'INTERVIEW';

interface NavbarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

const tabs = [
  { id: 'LIVE_COACH' as const, label: 'Live Coach', icon: Mic2 },
  { id: 'CONVERSATION' as const, label: 'Conversation', icon: MessageSquare },
  { id: 'INTERVIEW' as const, label: 'Interview', icon: BriefcaseBusiness }
];

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab }) => (
  <header className="app-header">
    <div className="app-header-inner">
      <div className="flex items-center gap-3 shrink-0">
        <div className="brand-mark">
          <Mic2 className="w-5 h-5" />
        </div>
        <span className="brand-name">Communication Coach</span>
      </div>

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
    </div>
  </header>
);
