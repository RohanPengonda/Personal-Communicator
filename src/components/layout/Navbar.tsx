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
  <header className="sticky top-0 z-50 border-b border-white/10 bg-surface-950/95 backdrop-blur-xl">
    <div className="max-w-6xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center">
          <Mic2 className="w-5 h-5 text-surface-950" />
        </div>
        <span className="font-extrabold text-white">Communication Coach</span>
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
