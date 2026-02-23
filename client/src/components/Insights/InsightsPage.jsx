/**
 * Insights Page -- Unified hub: Stats, Predictions, and Draft History.
 */
import { useState } from 'react';
import { Brain, Sparkles, Clock } from 'lucide-react';
import DraftPrediction from './DraftPrediction';
import DraftHistory from '../History/DraftHistory';

const TABS = [
  { id: 'history',    label: 'Historique',  icon: Clock,     desc: 'Drafts passes' },
  { id: 'prediction', label: 'Predictions', icon: Sparkles,  desc: 'Analyse IA du draft' },
];

export default function InsightsPage({ champions }) {
  const [activeTab, setActiveTab] = useState('history');

  return (
    <div className="h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-muted border border-accent/20 flex items-center justify-center">
            <Brain size={20} className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-txt-primary">Insights</h1>
            <p className="text-xs text-txt-muted">
              Statistiques, analyse IA et historique de tes drafts
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1.5 bg-surface-default rounded-xl p-1 border border-border-subtle">
          {TABS.map(({ id, label, icon: Icon, desc }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === id
                  ? 'bg-accent text-white shadow-glow'
                  : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-elevated border border-transparent'
              }`}
              title={desc}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="min-h-[500px] animate-fade-in-up" key={activeTab}>
          {activeTab === 'prediction' && <DraftPrediction />}
          {activeTab === 'history' && <DraftHistory champions={champions || []} embedded />}
        </div>
      </div>
    </div>
  );
}
