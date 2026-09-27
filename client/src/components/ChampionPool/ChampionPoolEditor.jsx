// ─────────────────────────────────────────────
// Champion Pool — ton pool par rôle et par niveau (S → D), ajout à droite
// Sauvegarde automatique côté serveur.
// ─────────────────────────────────────────────
import React, { useEffect, useId, useMemo, useState } from 'react';
import PoolAdvisor from '../PoolAdvisor';
import { TierBadge } from '../Primitives';
import useUserStore from '../../stores/userStore';
import useChampionsStore from '../../stores/championsStore';
import { ROLES, TIERS } from '../../lib/constants';
import { normalizeName } from '../../lib/championSearch';
import { champIcon, ROLE_LABEL } from '../../data/mock';

const TIER_HINT = { S: 'Prioritaire', A: 'Très bon', B: 'Standard', C: 'Occasionnel', D: 'À apprendre' };

// ── Champion du pool : niveau ↑ ↓, retrait ──────
function PoolCard({ champ, tier, onPromote, onDemote, onRemove }) {
  const i = TIERS.indexOf(tier);
  return (
    <li className="pool-card">
      <img src={champIcon(champ.key)} alt="" width="72" height="60" loading="lazy"/>
      <span className="pool-card__name">{champ.name}</span>
      <span className="pool-card__ctl">
        <button className="mini" disabled={i <= 0} aria-label={`Monter ${champ.name} au niveau ${TIERS[i - 1] || tier}`} onClick={onPromote}>↑</button>
        <button className="mini" disabled={i >= TIERS.length - 1} aria-label={`Descendre ${champ.name} au niveau ${TIERS[i + 1] || tier}`} onClick={onDemote}>↓</button>
        <button className="mini mini--x" aria-label={`Retirer ${champ.name} du pool`} onClick={onRemove}>×</button>
      </span>
    </li>
  );
}

// ── Un niveau (S, A, B, C, D) ───────────────────
function TierRow({ tier, entries, champById, onPromote, onDemote, onRemove }) {
  return (
    <section className="tier-row" aria-label={`Niveau ${tier} · ${TIER_HINT[tier]}`}>
      <div className="tier-row__head">
        <TierBadge tier={tier} large/>
        <span className="tier-row__hint">{TIER_HINT[tier]}</span>
        <span className="tier-row__count">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="tier-row__empty">Aucun champion en {tier}</p>
      ) : (
        <ul className="tier-row__cards">
          {entries.map(e => {
            const champ = champById[e.champion_id];
            if (!champ) {
              // Entry saved under a previous catalogue: keep it removable.
              return (
                <li key={e.champion_id} className="pool-card pool-card--unknown">
                  <span className="pool-card__name">#{e.champion_id} inconnu</span>
                  <span className="pool-card__ctl">
                    <button className="mini mini--x" aria-label={`Retirer le champion ${e.champion_id}, absent du catalogue`} onClick={() => onRemove(e.champion_id)}>×</button>
                  </span>
                </li>
              );
            }
            return (
              <PoolCard key={e.champion_id} champ={champ} tier={tier}
                onPromote={() => onPromote(e.champion_id, tier)}
                onDemote={() => onDemote(e.champion_id, tier)}
                onRemove={() => onRemove(e.champion_id)}/>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── État de la sauvegarde ───────────────────────
function SaveState() {
  const { saveStatus, error, profileAvailable, saveAllPools, loadProfile, ownerId } = useUserStore();
  if (error) {
    return (
      <span className="save-state save-state--bad" role="alert">
        {error} <button className="btn btn--sm btn--ghost" onClick={() => profileAvailable ? saveAllPools() : loadProfile(ownerId)}>Réessayer</button>
      </span>
    );
  }
  const text = saveStatus === 'pending' ? 'Sauvegarde…' : saveStatus === 'saved' ? 'Pool enregistré' : 'Sauvegarde automatique';
  return <span className="save-state" role="status">{text}</span>;
}

export default function ChampionPoolEditor() {
  const championPool = useUserStore(s => s.championPool);
  const addToPool = useUserStore(s => s.addToPool);
  const removeFromPool = useUserStore(s => s.removeFromPool);
  const changeTier = useUserStore(s => s.changeTier);
  const { champions, loaded, loading, load } = useChampionsStore();
  const [activeRole, setActiveRole] = useState('mid');
  const [search, setSearch] = useState('');
  const [showAllChamps, setShowAllChamps] = useState(false);
  const searchId = useId();

  useEffect(() => { load(); }, [load]);

  const poolForRole = championPool[activeRole] || [];
  const champById = useMemo(() => Object.fromEntries(champions.map(c => [c.id, c])), [champions]);
  const inPool = useMemo(() => new Set(poolForRole.map(e => e.champion_id)), [poolForRole]);

  // Pool entries grouped by tier (S → D), sorted alpha within each tier
  const entriesByTier = useMemo(() => {
    const groups = { S: [], A: [], B: [], C: [], D: [] };
    for (const e of poolForRole) groups[TIERS.includes(e.tier) ? e.tier : 'B'].push(e);
    for (const t of TIERS) groups[t].sort((a, b) => (champById[a.champion_id]?.name || '').localeCompare(champById[b.champion_id]?.name || ''));
    return groups;
  }, [poolForRole, champById]);

  // Picker = champions of the role not yet in the pool, filtered by the search
  const availableChamps = useMemo(() => {
    const q = normalizeName(search);
    return champions
      .filter(c => (showAllChamps || (Array.isArray(c.roles) ? c.roles.includes(activeRole) : true)) && !inPool.has(c.id))
      .filter(c => !q || normalizeName(c.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [champions, activeRole, search, inPool, showAllChamps]);

  const totalCount = ROLES.reduce((sum, r) => sum + (championPool[r]?.length || 0), 0);
  const move = (champId, tier, step) => {
    const next = TIERS[TIERS.indexOf(tier) + step];
    if (next) changeTier(activeRole, champId, next);
  };
  const role = ROLE_LABEL[activeRole];

  return (
    <div className="pool">
      <header className="page-head">
        <div>
          <h1 className="page-head__title">Pool</h1>
          <p className="page-head__sub">Tes champions par rôle et par niveau. Le niveau pèse sur la maîtrise dans l'analyse.</p>
        </div>
        <div className="page-head__aside">
          <span className="pill">{totalCount} CHAMPION{totalCount > 1 ? 'S' : ''}</span>
          <SaveState/>
        </div>
      </header>

      <div className="tabs tabs--fill" role="tablist" aria-label="Rôle">
        {ROLES.map(r => {
          const count = championPool[r]?.length || 0;
          return (
            <button key={r} role="tab" className="tab" aria-selected={activeRole === r} onClick={() => { setActiveRole(r); setSearch(''); }}>
              {ROLE_LABEL[r]}
              {count > 0 && <span className="tab__count">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="pool__advisor"><PoolAdvisor role={activeRole}/></div>

      <div className="pool__panes" role="tabpanel" aria-label={`Pool ${role}`}>
        <section className="pool__mine" aria-labelledby="pool-mine-h">
          <div className="pane-head">
            <h2 id="pool-mine-h">Ton pool · {role}</h2>
            <span className="lbl">{poolForRole.length} champion{poolForRole.length > 1 ? 's' : ''}</span>
          </div>
          <div className="pane-body">
            {!loaded && loading && <p className="empty" role="status">Chargement…</p>}
            {loaded && poolForRole.length === 0 && (
              <div className="empty">
                <p className="empty__title">Pool vide en {role}</p>
                <p>Ajoute des champions depuis la colonne de droite. Sans pool, l'analyse propose toute la méta.</p>
              </div>
            )}
            {loaded && poolForRole.length > 0 && TIERS.map(t => (
              <TierRow key={t} tier={t} entries={entriesByTier[t]} champById={champById}
                onPromote={(id, tier) => move(id, tier, -1)}
                onDemote={(id, tier) => move(id, tier, 1)}
                onRemove={id => removeFromPool(activeRole, id)}/>
            ))}
          </div>
        </section>

        <section className="pool__add" aria-labelledby="pool-add-h">
          <div className="pane-head">
            <h2 id="pool-add-h">Ajouter · {showAllChamps ? 'tous les rôles' : role}</h2>
            <span className="lbl">{availableChamps.length} disponible{availableChamps.length > 1 ? 's' : ''}</span>
          </div>
          <div className="pool__search">
            <label htmlFor={searchId} className="visually-hidden">Rechercher un champion à ajouter</label>
            <input id={searchId} className="field" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={showAllChamps ? 'Rechercher un champion…' : `Rechercher en ${role}…`} autoComplete="off" spellCheck={false}/>
            <div className="seg" role="group" aria-label="Champions proposés">
              <button aria-pressed={!showAllChamps} onClick={() => setShowAllChamps(false)}>Rôle</button>
              <button aria-pressed={showAllChamps} onClick={() => setShowAllChamps(true)}>Tous</button>
            </div>
          </div>
          <div className="pane-body">
            {!loaded && loading && <p className="empty" role="status">Chargement…</p>}
            {loaded && availableChamps.length === 0 && (
              <p className="empty">{search ? `Aucun résultat pour « ${search} »` : 'Tous les champions de ce rôle sont déjà dans ton pool.'}</p>
            )}
            {availableChamps.length > 0 && (
              <ul className="pick-grid">
                {availableChamps.map(c => (
                  <li key={c.id}>
                    <button className="pick-card" aria-label={`Ajouter ${c.name} au pool, niveau B`} onClick={() => addToPool(activeRole, c, 'B')}>
                      <img src={champIcon(c.key)} alt="" width="60" height="52" loading="lazy"/>
                      <span className="pick-card__name">{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
