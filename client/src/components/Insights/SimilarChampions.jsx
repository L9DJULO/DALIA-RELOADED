/**
 * Similar Champions — "You play X? Try Y" with intuitive champion cards.
 * Uses the ML embeddings API to find champions with similar playstyles.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Sparkles, ArrowRight, X, Loader2 } from 'lucide-react';
import { fetchSimilarChampions, fetchEmbeddings } from '../../services/api';
import RoleIcon from '../RoleIcon';
import useUserStore from '../../stores/userStore';

const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const DDRAGON = 'https://ddragon.leagueoflegends.com/cdn/14.24.1/img/champion';

/* Similarity match reason (based on similarity %) */
function getMatchReason(similarity) {
  if (similarity >= 0.85) return { text: 'Très similaire', color: 'text-emerald-400', bg: 'bg-emerald-500/10' };
  if (similarity >= 0.70) return { text: 'Style proche', color: 'text-sky-400', bg: 'bg-sky-500/10' };
  if (similarity >= 0.55) return { text: 'Alternative viable', color: 'text-amber-400', bg: 'bg-amber-500/10' };
  return { text: 'Profil différent', color: 'text-slate-400', bg: 'bg-slate-700/50' };
}

/* Similar champion card */
function SimilarCard({ champ, onClick }) {
  const reason = getMatchReason(champ.similarity);
  const pct = (champ.similarity * 100).toFixed(0);

  return (
    <button
      onClick={() => onClick(champ.champion_id)}
      className="flex items-center gap-3 w-full p-3 rounded-xl bg-surface border border-slate-700/50 hover:border-slate-600 hover:bg-surface-elevated/60 transition-all group text-left"
    >
      <img
        src={champ.image_url || `${DDRAGON}/${champ.champion_key || champ.champion_name}.png`}
        alt={champ.champion_name}
        className="w-12 h-12 rounded-lg border border-slate-700 group-hover:border-amber-500/30 transition-colors"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-100 group-hover:text-white truncate">
          {champ.champion_name}
        </div>
        <div className={`text-[11px] font-medium ${reason.color}`}>
          {reason.text}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className={`text-sm font-bold tabular-nums ${
          champ.similarity >= 0.7 ? 'text-emerald-400' : 'text-amber-400'
        }`}>
          {pct}%
        </div>
        <div className="text-[10px] text-slate-500">match</div>
      </div>
    </button>
  );
}

/* Selected champion detail panel */
function ChampionDetail({ champion, similar, loading, onSelectSimilar, onClear }) {
  return (
    <div className="space-y-4">
      {/* Selected champion */}
      <div className="panel p-4 flex items-center gap-4">
        <img
          src={champion.image_url || `${DDRAGON}/${champion.key || champion.champion_key || champion.name}.png`}
          alt={champion.name || champion.champion_name}
          className="w-16 h-16 rounded-xl border-2 border-amber-500/30"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-slate-100">{champion.name || champion.champion_name}</span>
            <button
              onClick={onClear}
              className="p-1 rounded-md hover:bg-surface-elevated text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            Champions au profil similaire selon l'analyse IA
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Sparkles size={16} className="text-amber-400" />
          <span className="text-sm font-medium text-amber-400">{similar.length} suggestions</span>
        </div>
      </div>

      {/* Similar list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="text-amber-500 animate-spin" />
        </div>
      ) : similar.length > 0 ? (
        <div>
          <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mb-3 flex items-center gap-1.5">
            <ArrowRight size={11} />
            Tu pourrais aimer
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {similar.map((s) => (
              <SimilarCard
                key={s.champion_id}
                champ={s}
                onClick={onSelectSimilar}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-slate-500">
          Modèle IA non disponible — entraînez-le d'abord dans les paramètres.
        </div>
      )}
    </div>
  );
}

export default function SimilarChampions({ champions }) {
  const [role, setRole] = useState('mid');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChampion, setSelectedChampion] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);

  const championPool = useUserStore((s) => s.championPool);

  // Pool champions for current role (suggest these first)
  const poolChampIds = useMemo(() => {
    const entries = championPool[role] || [];
    return new Set(entries.map((e) => e.champion_id));
  }, [championPool, role]);

  // Check ML availability
  useEffect(() => {
    fetchEmbeddings(role)
      .then((data) => setAvailable(data.available || false))
      .catch(() => setAvailable(false));
  }, [role]);

  // Filtered champion list for search
  const filteredChampions = useMemo(() => {
    if (!champions?.length) return [];
    let list = champions.filter((c) => c.roles?.includes(role));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    // Sort: pool champions first, then alphabetical
    return list.sort((a, b) => {
      const aPool = poolChampIds.has(a.id) ? 0 : 1;
      const bPool = poolChampIds.has(b.id) ? 0 : 1;
      if (aPool !== bPool) return aPool - bPool;
      return a.name.localeCompare(b.name);
    });
  }, [champions, role, searchQuery, poolChampIds]);

  // Load similar champions when selection changes
  const handleSelect = useCallback(async (champId) => {
    const champ = champions.find((c) => c.id === champId);
    if (!champ) return;
    setSelectedChampion(champ);
    setLoading(true);
    try {
      const data = await fetchSimilarChampions(champId, role, 10);
      setSimilar(data.similar || []);
    } catch {
      setSimilar([]);
    } finally {
      setLoading(false);
    }
  }, [champions, role]);

  const handleClear = () => {
    setSelectedChampion(null);
    setSimilar([]);
  };

  return (
    <div className="space-y-4">
      {/* Role selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500 font-medium">Rôle</span>
        <div className="flex gap-0.5 bg-surface rounded-lg p-0.5 border border-slate-700/50">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => { setRole(r); handleClear(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                role === r
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <RoleIcon role={r} size={14} />
              <span className="capitalize">{r}</span>
            </button>
          ))}
        </div>
      </div>

      {!available && (
        <div className="panel p-6 text-center">
          <Sparkles size={28} className="text-slate-600 mx-auto mb-3" />
          <div className="text-sm font-medium text-slate-300 mb-1">Modèle IA non disponible</div>
          <div className="text-xs text-slate-500">
            L'analyse de similarité nécessite un modèle entraîné.
            Rendez-vous dans Paramètres → Admin pour lancer l'entraînement.
          </div>
        </div>
      )}

      {available && !selectedChampion && (
        <>
          {/* Search bar */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Chercher un champion que tu joues…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-slate-700/50 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/50 transition-colors"
            />
          </div>

          {/* Champion grid */}
          <div>
            {poolChampIds.size > 0 && !searchQuery && (
              <div className="text-[11px] text-slate-500 uppercase tracking-wider font-medium mb-2">
                Ton pool
              </div>
            )}
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
              {filteredChampions.slice(0, 60).map((c) => {
                const isPool = poolChampIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => handleSelect(c.id)}
                    className={`group relative rounded-lg overflow-hidden border transition-all hover:scale-105 hover:z-10 ${
                      isPool
                        ? 'border-amber-500/30 ring-1 ring-amber-500/15'
                        : 'border-slate-700/50 hover:border-slate-600'
                    }`}
                    title={c.name}
                  >
                    <img
                      src={c.image_url}
                      alt={c.name}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-0.5 py-0.5">
                      <div className="text-[9px] text-slate-200 font-medium truncate text-center">
                        {c.name}
                      </div>
                    </div>
                    {isPool && (
                      <div className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-bl" />
                    )}
                  </button>
                );
              })}
            </div>
            {filteredChampions.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-500">
                Aucun champion trouvé
              </div>
            )}
          </div>
        </>
      )}

      {available && selectedChampion && (
        <ChampionDetail
          champion={selectedChampion}
          similar={similar}
          loading={loading}
          onSelectSimilar={handleSelect}
          onClear={handleClear}
        />
      )}
    </div>
  );
}
