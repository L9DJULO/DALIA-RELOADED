import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, Save, Check } from 'lucide-react';
import useUserStore, { ROLES, TIERS } from '../../stores/userStore';
import RoleTierList from './RoleTierList';
import ChampionCard from './ChampionCard';
import RoleIcon from '../RoleIcon';

const ROLE_LABELS = { top: 'Top', jungle: 'Jungle', mid: 'Mid', bot: 'Bot', support: 'Support' };

const TIER_COLORS = {
  S: 'bg-red-500 hover:bg-red-400',
  A: 'bg-orange-500 hover:bg-orange-400',
  B: 'bg-amber-500 hover:bg-amber-400',
  C: 'bg-blue-500 hover:bg-blue-400',
  D: 'bg-surface-overlay hover:bg-surface-elevated',
};

/* -- Tier picker popover -- */
function TierPicker({ champion, position, onSelect, onClose, isUpdate = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const popoverHeight = 80;
  const openUpward = position.y + popoverHeight > window.innerHeight;
  const top = openUpward ? position.y - popoverHeight - 8 : position.y;

  return (
    <div
      ref={ref}
      className="fixed z-50 glass-panel p-3 animate-scale-in"
      style={{ left: Math.min(position.x, window.innerWidth - 240), top: Math.max(8, top) }}
      role="dialog"
      aria-label="Selectionner un tier"
    >
      <div className="text-[11px] mb-2.5 px-0.5 text-txt-secondary">
        {isUpdate ? 'Changer tier de' : 'Ajouter'}{' '}
        <span className="font-semibold text-txt-primary">{champion.name}</span>
      </div>
      <div className="flex gap-1.5">
        {TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => onSelect(tier)}
            aria-label={`Tier ${tier}`}
            className={`w-9 h-9 rounded-xl text-xs font-bold text-white transition-all duration-150 hover:scale-105 ${TIER_COLORS[tier]}`}
          >
            {tier}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChampionPoolEditor({ champions }) {
  const [activeRole, setActiveRole] = useState('mid');
  const [search, setSearch] = useState('');
  const [filterByRole, setFilterByRole] = useState(false);
  const [tierPicker, setTierPicker] = useState(null);
  const [saved, setSaved] = useState(false);
  const { championPool, addToPool, changeTier, savePool } = useUserStore();

  const poolIdsForRole = useMemo(() => {
    const ids = new Set();
    for (const e of (championPool[activeRole] || [])) ids.add(e.champion_id);
    return ids;
  }, [championPool, activeRole]);

  const filteredChampions = useMemo(() => {
    let list = Array.isArray(champions) ? [...champions] : [];
    if (filterByRole) {
      list = list.filter((c) => c.roles.includes(activeRole));
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const aIn = poolIdsForRole.has(a.id) ? 0 : 1;
      const bIn = poolIdsForRole.has(b.id) ? 0 : 1;
      if (aIn !== bIn) return aIn - bIn;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [champions, activeRole, search, poolIdsForRole, filterByRole]);

  const handleChampClick = (champion, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTierPicker({
      champion,
      isUpdate: poolIdsForRole.has(champion.id),
      x: Math.min(rect.left, window.innerWidth - 240),
      y: rect.bottom + 6,
    });
  };

  const handleTierSelect = (tier) => {
    if (tierPicker) {
      if (tierPicker.isUpdate) {
        changeTier(activeRole, tierPicker.champion.id, tier);
      } else {
        addToPool(activeRole, tierPicker.champion, tier);
      }
      setTierPicker(null);
    }
  };

  const handleSave = async () => {
    await savePool(activeRole);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* -- Left: Tier list per role -- */}
      <div className="w-72 border-r border-border-subtle flex flex-col bg-surface-default">
        {/* Role tabs */}
        <div className="flex border-b border-border-subtle">
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => { setActiveRole(role); setTierPicker(null); }}
              aria-pressed={activeRole === role}
              aria-label={ROLE_LABELS[role]}
              className={`flex-1 py-2.5 text-[11px] font-medium transition-all duration-200 ${
                activeRole === role
                  ? 'border-b-2 border-accent bg-surface-elevated text-txt-primary'
                  : 'text-txt-muted hover:text-txt-secondary'
              }`}
            >
              <RoleIcon role={role} size={16} className={`mx-auto mb-0.5 ${activeRole === role ? 'text-accent' : 'text-txt-muted'}`} />
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {/* Tier list */}
        <div className="flex-1 overflow-y-auto p-3">
          <RoleTierList role={activeRole} champions={champions} />
        </div>

        <div className="p-3 border-t border-border-subtle">
          <button
            onClick={handleSave}
            aria-label={saved ? 'Sauvegarde' : `Sauvegarder ${ROLE_LABELS[activeRole]}`}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
              saved
                ? 'bg-emerald-500 text-white'
                : 'btn-primary'
            }`}
          >
            {saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? 'Sauvegarde' : `Sauvegarder ${ROLE_LABELS[activeRole]}`}
          </button>
        </div>
      </div>

      {/* -- Right: Champion browser -- */}
      <div className="flex-1 flex flex-col bg-surface-base">
        <div className="p-3 border-b border-border-subtle flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher..."
              aria-label="Rechercher un champion"
              className="input-field w-full pl-9 pr-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={() => setFilterByRole(!filterByRole)}
            aria-pressed={filterByRole}
            className={`text-[11px] px-3 py-1.5 rounded-xl border font-medium transition-all duration-200 ${
              filterByRole
                ? 'border-accent/30 bg-accent-muted text-accent'
                : 'border-border-subtle text-txt-secondary hover:border-accent/20'
            }`}
          >
            {filterByRole ? `${ROLE_LABELS[activeRole]} uniquement` : 'Tous les roles'}
          </button>

          <div className="text-[11px] text-txt-muted">
            <span className="tabular-nums font-medium text-txt-primary">{filteredChampions.length}</span> champions
            <span className="mx-1">·</span>
            <span className="text-accent tabular-nums font-medium">{(championPool[activeRole] || []).length}</span> dans le pool
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="grid grid-cols-6 2xl:grid-cols-8 gap-1.5">
            {filteredChampions.map((champ) => {
              const inPool = poolIdsForRole.has(champ.id);
              return (
                <ChampionCard
                  key={champ.id}
                  champion={champ}
                  inPool={inPool}
                  onAdd={(e) => handleChampClick(champ, e)}
                  compact
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Tier picker popover */}
      {tierPicker && (
        <TierPicker
          champion={tierPicker.champion}
          position={{ x: tierPicker.x, y: tierPicker.y }}
          isUpdate={tierPicker.isUpdate}
          onSelect={handleTierSelect}
          onClose={() => setTierPicker(null)}
        />
      )}
    </div>
  );
}
