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
  D: 'bg-slate-500 hover:bg-slate-400',
};

/* ── Tier picker popover ── */
function TierPicker({ champion, position, onSelect, onClose, isUpdate = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const popoverHeight = 72;
  const openUpward = position.y + popoverHeight > window.innerHeight;
  const top = openUpward ? position.y - popoverHeight - 8 : position.y;

  return (
    <div
      ref={ref}
      className="fixed z-50 border rounded-xl shadow-2xl p-2.5"
      style={{ ...{ left: Math.min(position.x, window.innerWidth - 240), top: Math.max(8, top) }, background: 'var(--surface-elevated)', borderColor: 'var(--border-subtle)' }}
      role="dialog"
      aria-label="Sélectionner un tier"
    >
      <div className="text-[11px] mb-2 px-0.5" style={{ color: 'var(--text-secondary)' }}>
        {isUpdate ? 'Changer tier de' : 'Ajouter'}{' '}
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{champion.name}</span>
      </div>
      <div className="flex gap-1">
        {TIERS.map((tier) => (
          <button
            key={tier}
            onClick={() => onSelect(tier)}
            aria-label={`Tier ${tier}`}
            className={`w-8 h-8 rounded-lg text-xs font-bold text-white transition-colors duration-150 ${TIER_COLORS[tier]}`}
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
    <div className="flex h-[calc(100vh-2.5rem)]">
      {/* ── Left: Tier list per role ── */}
      <div className="w-72 border-r flex flex-col" style={{ borderColor: 'var(--border-subtle)', background: 'var(--surface-default)' }}>
        {/* Role tabs */}
        <div className="flex border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => { setActiveRole(role); setTierPicker(null); }}
              aria-pressed={activeRole === role}
              aria-label={ROLE_LABELS[role]}
              className={`flex-1 py-2.5 text-[11px] font-medium transition-colors duration-150 ${
                activeRole === role
                  ? 'border-b-2 border-violet-500'
                  : ''
              }`}
              style={{ color: activeRole === role ? 'var(--text-primary)' : 'var(--text-muted)', background: activeRole === role ? 'var(--surface-elevated)' : 'transparent' }}
            >
              <RoleIcon role={role} size={16} className={`mx-auto mb-0.5 ${activeRole === role ? 'text-violet-500' : ''}`} style={activeRole !== role ? { color: 'var(--text-muted)' } : undefined} />
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>

        {/* Tier list */}
        <div className="flex-1 overflow-y-auto p-3">
          <RoleTierList role={activeRole} champions={champions} />
        </div>

        <div className="p-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={handleSave}
            aria-label={saved ? 'Sauvegardé' : `Sauvegarder ${ROLE_LABELS[activeRole]}`}
            className={`w-full py-2 rounded-xl text-sm font-medium transition-colors duration-150 flex items-center justify-center gap-2 ${
              saved
                ? 'bg-emerald-500 text-white'
                : 'btn-primary'
            }`}
          >
            {saved ? <Check size={15} /> : <Save size={15} />}
            {saved ? 'Sauvegardé' : `Sauvegarder ${ROLE_LABELS[activeRole]}`}
          </button>
        </div>
      </div>

      {/* ── Right: Champion browser ── */}
      <div className="flex-1 flex flex-col" style={{ background: 'var(--surface-base)' }}>
        <div className="p-3 border-b flex items-center gap-3" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher un champion"
              className="input-field w-full pl-9 pr-3 py-2 text-sm"
            />
          </div>

          <button
            onClick={() => setFilterByRole(!filterByRole)}
            aria-pressed={filterByRole}
            className={`text-[11px] px-2.5 py-1.5 rounded-xl border font-medium transition-colors duration-150 ${
              filterByRole
                ? 'border-violet-500/30 bg-violet-500/10 text-violet-400'
                : ''
            }`}
            style={!filterByRole ? { borderColor: 'var(--border-default)', color: 'var(--text-secondary)' } : undefined}
          >
            {filterByRole ? `${ROLE_LABELS[activeRole]} uniquement` : 'Tous les rôles'}
          </button>

          <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>{filteredChampions.length}</span> champions
            <span className="mx-1">·</span>
            <span className="text-violet-400 tabular-nums font-medium">{(championPool[activeRole] || []).length}</span> dans le pool
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
