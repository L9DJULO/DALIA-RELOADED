/**
 * Insights Page -- Personal stats & live draft analysis.
 */
import { useState } from 'react';
import { Brain, BarChart3, Sparkles } from 'lucide-react';
import MyStats from './MyStats';
import DraftPrediction from './DraftPrediction';

const TABS = [
  { id: 'stats',      label: 'Tes Stats',   icon: BarChart3,  desc: 'Performance et progression' },
  { id: 'prediction', label: 'Predictions',  icon: Sparkles,   desc: 'Analyse IA du draft' },
];

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState('stats');

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
              Tes statistiques personnelles et analyse IA du draft
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
          {activeTab === 'stats' && <MyStats />}
          {activeTab === 'prediction' && <DraftPrediction />}
        </div>
      </div>
    </div>
  );
}
