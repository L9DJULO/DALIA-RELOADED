/**
 * Insights Page — Personal stats & live draft analysis.
 *
 * Tabs:
 *   1. Tes Stats — Personal win rates, progression, champion mastery
 *   2. Prédictions — Live draft win probability + breakdown
 */
import { useState } from 'react';
import { Brain, BarChart3, Sparkles } from 'lucide-react';
import MyStats from './MyStats';
import DraftPrediction from './DraftPrediction';

const TABS = [
  { id: 'stats',      label: 'Tes Stats',    icon: BarChart3,   desc: 'Performance et progression' },
  { id: 'prediction', label: 'Prédictions',  icon: Sparkles,    desc: 'Analyse IA du draft' },
];

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState('stats');

  return (
    <div className="h-[calc(100vh-2.5rem)] overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
            <Brain size={18} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[var(--text-primary)]">Insights</h1>
            <p className="text-xs text-[var(--text-muted)]">
              Tes statistiques personnelles et analyse IA du draft
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[var(--surface-default)] rounded-xl p-1 border border-[var(--border-subtle)]">
          {TABS.map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === id
                  ? 'bg-violet-500/15 text-violet-400 border border-violet-500/25 shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-surface-elevated/50 border border-transparent'
              }`}
              title={desc}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-[500px]">
          {activeTab === 'stats' && <MyStats />}
          {activeTab === 'prediction' && <DraftPrediction />}
        </div>
      </div>
    </div>
  );
}
