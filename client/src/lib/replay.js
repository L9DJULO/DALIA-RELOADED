const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
const validChampion = c => c === null || (c && Number.isInteger(c.id) && c.id > 0 && c.id <= 10000 && typeof c.key === 'string' && c.key.length <= 50 && typeof c.name === 'string' && c.name.length <= 100);

export function validateReplay(raw) {
  if (!raw || raw.schema_version !== 1 || !Array.isArray(raw.steps) || !raw.steps.length || raw.steps.length > 100) throw new Error('Format de replay invalide (version 1, 1 à 100 étapes).');
  const steps = raw.steps.map(step => {
    const s = step.state;
    if (!s || !['blue', 'red'].includes(s.myTeam) || !ROLES.includes(s.myRole) || !Number.isInteger(s.myPickOrder) || s.myPickOrder < 1 || s.myPickOrder > 5 || !Number.isInteger(s.currentAction) || s.currentAction < 0 || s.currentAction > 19 || !Number.isFinite(Date.parse(step.at))) throw new Error('Contexte de draft invalide.');
    for (const key of ['blueBans', 'redBans', 'enemyPicks']) if (!Array.isArray(s[key]) || s[key].length !== 5 || !s[key].every(validChampion)) throw new Error('Liste de champions invalide.');
    for (const key of ['allyPicks', 'allyPrepicks']) if (!s[key] || !ROLES.every(role => validChampion(s[key][role]))) throw new Error('Rôles alliés invalides.');
    const picks = [...Object.values(s.allyPicks), ...s.enemyPicks].filter(Boolean).map(c => c.id);
    const bans = [...s.blueBans, ...s.redBans].filter(Boolean).map(c => c.id);
    if (new Set(picks).size !== picks.length || picks.some(id => bans.includes(id))) throw new Error('Champion choisi deux fois ou déjà banni.');
    const clean = c => c ? { id: c.id, key: c.key, name: c.name } : null;
    return { at: new Date(step.at).toISOString(), state: { myTeam: s.myTeam, myRole: s.myRole, myPickOrder: s.myPickOrder,
      currentAction: s.currentAction, autoDetected: false, blueBans: s.blueBans.map(clean), redBans: s.redBans.map(clean), enemyPicks: s.enemyPicks.map(clean),
      allyPicks: Object.fromEntries(ROLES.map(r => [r, clean(s.allyPicks[r])])), allyPrepicks: Object.fromEntries(ROLES.map(r => [r, clean(s.allyPrepicks[r])])) } };
  });
  return { schema_version: 1, steps };
}

export function historyPayload(draft) {
  const session = draft.exportSession();
  const pick = (c, role = '') => ({ champion_id: c.id, champion_key: c.key, champion_name: c.name, role });
  const myPick = draft.allyPicks[draft.myRole];
  const best = draft.stale ? null : draft.recommendations[0];
  return { session_id: session.session_id, timeline: session.steps, patch: draft.dataStatus?.patch || null,
    my_team: draft.myTeam, my_role: draft.myRole, my_champion_id: myPick?.id || null,
    my_champion_key: myPick?.key || null, my_champion_name: myPick?.name || null,
    ally_picks: Object.entries(draft.allyPicks).filter(([, c]) => c).map(([role, c]) => pick(c, role)),
    enemy_picks: draft.enemyPicks.filter(Boolean).map(c => pick(c)),
    ally_bans: (draft.myTeam === 'blue' ? draft.blueBans : draft.redBans).filter(Boolean).map(c => pick(c)),
    enemy_bans: (draft.myTeam === 'blue' ? draft.redBans : draft.blueBans).filter(Boolean).map(c => pick(c)),
    recommended_champion: best?.champion_key || null, recommendation_score: best?.total_score ?? null,
    score_unit: best ? 'wr_points' : null,
    win_probability: best?.breakdown?.ml_explanation?.win_probability != null ? best.breakdown.ml_explanation.win_probability * 100 : null };
}

export function downloadReplay(session) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'dalia-draft.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
