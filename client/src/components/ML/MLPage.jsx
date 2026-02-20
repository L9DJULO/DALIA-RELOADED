import MLStatusPanel from './MLStatusPanel';
import ChampionEmbeddings from './ChampionEmbeddings';

export default function MLPage() {
  return (
    <div className="h-[calc(100vh-2.5rem)] overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-slate-100">Intelligence Artificielle</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Modèle de prédiction de draft · Re-entraînement automatique · Visualisation des embeddings
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column: ML Status */}
          <div className="lg:col-span-1 space-y-4">
            <MLStatusPanel />

            {/* Info card */}
            <div className="rounded-lg border border-slate-700/50 bg-surface p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-300">Comment ça marche</div>
              <div className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                <p>
                  Le modèle IA utilise un <span className="text-slate-400">réseau de neurones</span> entraîné
                  sur des milliers de parties D2+ pour prédire les chances de victoire d'un draft.
                </p>
                <p>
                  Chaque champion est représenté par un <span className="text-slate-400">embedding 32D</span> qui
                  capture son style de jeu. Les champions proches dans cet espace ont des profils similaires.
                </p>
                <p>
                  Le <span className="text-violet-400">re-entraînement automatique</span> se déclenche quand un
                  nouveau patch est détecté via DDragon, pour que le modèle reste à jour.
                </p>
              </div>
            </div>
          </div>

          {/* Right column: Embeddings visualization */}
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-slate-700/50 bg-surface p-4">
              <div className="text-sm font-semibold text-slate-200 mb-3">
                Carte des champions (embeddings)
              </div>
              <ChampionEmbeddings />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
