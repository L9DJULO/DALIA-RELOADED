import { describe, expect, it } from 'vitest';
import { turnView, showBanAdvice, topGroupSize, groupPeer, rankLabel, dataStatusParts, synergyNote } from './draftView';

describe('turnView', () => {
  const live = { live: true, inChampSelect: true, myTeam: 'blue' };

  it('says nothing outside a live champion select', () => {
    expect(turnView({ ...live, live: false, actionType: 'pick', pickCount: 3 })).toBeNull();
    expect(turnView({ ...live, inChampSelect: false, actionType: 'pick', pickCount: 3 })).toBeNull();
  });

  it('names the pick number and whose turn it is', () => {
    expect(turnView({ ...live, actionType: 'pick', pickCount: 7, isMyTurn: true })).toEqual({ label: 'PICK 8 · À TOI', mine: true });
    expect(turnView({ ...live, actionType: 'pick', pickCount: 3, isMyTurn: false })).toEqual({ label: 'PICK 4 · ALLIÉ', mine: false });
    expect(turnView({ ...live, actionType: 'pick', pickCount: 1, isMyTurn: false })).toEqual({ label: 'PICK 2 · ENNEMI', mine: false });
  });

  it('flags the ban phase', () => {
    expect(turnView({ ...live, actionType: 'ban', pickCount: 0, isMyTurn: true })).toEqual({ label: 'BAN · À TOI', mine: true });
    expect(turnView({ ...live, actionType: 'ban', pickCount: 0, isMyTurn: false })).toEqual({ label: 'PHASE DE BAN', mine: false });
  });

  it('trusts the League client on who is acting', () => {
    expect(turnView({ ...live, actionType: 'pick', pickCount: 3, actionIsAlly: false })).toEqual({ label: 'PICK 4 · ENNEMI', mine: false });
    expect(turnView({ ...live, actionType: 'pick', pickCount: 1, actionIsAlly: true })).toEqual({ label: 'PICK 2 · ALLIÉ', mine: false });
  });

  it('names the phases around the picks', () => {
    expect(turnView({ ...live, phase: 'PLANNING' })).toEqual({ label: 'INTENTIONS', mine: false });
    expect(turnView({ ...live, phase: 'FINALIZATION' })).toEqual({ label: 'FINALISATION', mine: false });
  });

  it('stops after the tenth pick', () => {
    expect(turnView({ ...live, actionType: 'pick', pickCount: 10 })).toBeNull();
  });
});

describe('showBanAdvice', () => {
  it('shows ban advice during the live ban phase only', () => {
    expect(showBanAdvice({ mode: 'live', actionType: 'ban', pickCount: 0 })).toBe(true);
    expect(showBanAdvice({ mode: 'live', actionType: 'pick', pickCount: 0 })).toBe(false);
  });

  it('shows ban advice in a manual draft until the first pick', () => {
    expect(showBanAdvice({ mode: 'manual', pickCount: 0 })).toBe(true);
    expect(showBanAdvice({ mode: 'manual', pickCount: 1 })).toBe(false);
  });
});

describe('top group', () => {
  const picks = [{ name: 'Orianna', score: 2.4, tie: false }, { name: 'Ahri', score: 2.1, tie: true }, { name: 'Taliyah', score: 1.2, tie: false }, { name: 'Galio', score: -0.6, tie: true }];

  it('counts the leader and the picks tied with it at the top', () => {
    expect(topGroupSize(picks)).toBe(2);
    expect(topGroupSize([{ tie: false }, { tie: false }])).toBe(1);
    expect(topGroupSize([])).toBe(0);
  });

  it('names another member of the group for the selected pick', () => {
    expect(groupPeer(picks, 0)).toBe(picks[1]);
    expect(groupPeer(picks, 1)).toBe(picks[0]);
    expect(groupPeer(picks, 2)).toBeNull();
  });
});

describe('status bar', () => {
  it('writes ranks in French', () => {
    expect(rankLabel('emerald_plus')).toBe('Émeraude+');
    expect(rankLabel('master_plus')).toBe('Maître+');
    expect(rankLabel('gold')).toBe('Or');
    expect(rankLabel('mystery_tier')).toBe('mystery_tier');
    expect(rankLabel(null)).toBe('');
  });

  it('lists the data behind the advice and flags what is missing', () => {
    const parts = dataStatusParts({ patch: '16.19', rank: 'emerald_plus', meta_available: false, wpa_available: false, source_errors: ['u.gg'], meta_collected_at: Date.UTC(2026, 8, 26, 21, 40) / 1000 });
    expect(parts.map(p => p.text)).toEqual(expect.arrayContaining(['Patch 16.19', 'Émeraude+', 'Statistiques absentes : analyse des kits uniquement', 'Source dégradée', 'WPA indisponible']));
    expect(parts.find(p => p.text === 'WPA indisponible').warn).toBe(true);
    expect(parts.some(p => p.text.startsWith('Stats du '))).toBe(true);
  });

  it('shows the estimated WPA when the model is available', () => {
    expect(dataStatusParts({ patch: '16.19', meta_available: true, wpa_available: true }).map(p => p.text)).toContain('WPA estimé DALIA');
  });

  it('shows nothing before the first analysis', () => {
    expect(dataStatusParts(null)).toEqual([]);
  });
});

describe('synergyNote', () => {
  it('shows the games behind a measured pair', () => {
    const note = synergyNote({ games: 8816, source: 'observed' });
    expect(note.label.replace(/\s/g, ' ')).toBe('8 816 parties');
    expect(note.title).toMatch(/au-delà de la force de chacun/);
  });

  it('says when a measured pair was never played', () => {
    expect(synergyNote({ games: 0, source: 'observed' }).label).toBe('jamais jouée');
  });

  it('keeps the kit label for the fallback', () => {
    expect(synergyNote({ source: 'kit_heuristic' }).label).toBe('synergie kit');
    expect(synergyNote({}).label).toBe('synergie kit');
    expect(synergyNote().title).toMatch(/pas un gain de win rate/);
  });
});
