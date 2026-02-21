/**
 * DALIA — Shared constants.
 *
 * Single source of truth for values used across multiple components.
 */

/** DDragon base URL. */
export const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com/cdn';

/** Fallback DDragon version (used until the real one is fetched). */
const FALLBACK_VERSION = '14.24.1';

/** Module-level cache for the resolved DDragon version. */
let _resolvedVersion = localStorage.getItem('dalia_ddragon_version') || FALLBACK_VERSION;

/** Get the current DDragon version. */
export const getDDragonVersion = () => _resolvedVersion;

/** Set the DDragon version (called once after fetchPatch). */
export const setDDragonVersion = (version) => {
  if (version && version !== '?') {
    _resolvedVersion = version;
    localStorage.setItem('dalia_ddragon_version', version);
  }
};

/** Build a DDragon champion image URL using the current version. */
export const getDDragonChampUrl = (champKey) =>
  `${DDRAGON_BASE}/${_resolvedVersion}/img/champion/${champKey}.png`;

/** Convenience: champion image base path. */
export const getDDragonChampBase = () =>
  `${DDRAGON_BASE}/${_resolvedVersion}/img/champion`;

/** Role keys used throughout the application. */
export const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];

/** Human-readable role labels. */
export const ROLE_LABELS = {
  top: 'Top',
  jungle: 'Jungle',
  mid: 'Mid',
  bot: 'Bot',
  support: 'Support',
};

/** Tier list order. */
export const TIERS = ['S', 'A', 'B', 'C', 'D'];
