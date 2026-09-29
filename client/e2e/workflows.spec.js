import { test, expect } from '@playwright/test';
const champions = [
  { id: 103, key: 'Ahri', name: 'Ahri', roles: ['mid'] }, { id: 61, key: 'Orianna', name: 'Orianna', roles: ['mid'] },
  { id: 78, key: 'Poppy', name: 'Poppy', roles: ['top', 'jungle', 'support'] },
  { id: 59, key: 'JarvanIV', name: 'Jarvan IV', roles: ['jungle'] }, { id: 75, key: 'Nasus', name: 'Nasus', roles: ['top'] },
];
const recommendation = (champion, score, sd = 1.2, tie = false) => ({ champion_id: champion.id, champion_key: champion.key, champion_name: champion.name,
  total_score: score, score_sd: sd, score_range: [score - sd, score + sd], tie_with_leader: tie, confidence: 60,
  breakdown: { meta: 1.1, matchup: 2.0, synergy: 0, composition: 0.5, mastery: -1.5, draft_risk: 0, mechanics: 0, wpa_adjustment: 0, ml_explanation: null,
    terms: [{ name: 'meta', value: 1.1, sd: 0.8, source: 'observed', sample: 900, note: '' }, { name: 'matchup', value: 2.0, sd: 1.0, source: 'observed', sample: 400, note: '' }, { name: 'mastery', value: -1.5, sd: 1.5, source: 'heuristic', sample: 0, note: 'palier B' }] },
  is_pool_champion: true, matchup_details: [], synergy_details: [], tags: [], reasons: [{ text: 'Exemple de recommandation simulée pour le test.', kind: 'info' }], mechanics: [], verdict: 'Choix à examiner', wpa: null });

test.beforeEach(async ({ page }) => {
  let history = [];
  await page.addInitScript(() => {
    localStorage.setItem('dalia_token', 'test-token');
    localStorage.setItem('dalia_user', JSON.stringify({ id: 'test-user', username: 'Testeur', email: 'test@example.com' }));
  });
  await page.route('https://ddragon.leagueoflegends.com/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#414356"/></svg>' }));
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let data = {};
    if (path === '/api/auth/me') data = { id: 'test-user', username: 'Testeur', email: 'test@example.com' };
    else if (path === '/api/champions') data = champions;
    else if (path === '/api/patch') data = { version: '16.17.1', patch: '16.17' };
    else if (path === '/api/user/profile') data = { champion_pool: { mid: [{ champion_id: 103, champion_key: 'Ahri', tier: 'A' }] }, preferred_roles: ['mid'] };
    else if (path === '/api/duo/code') data = { duo_code: 'ABCDEF' };
    else if (path === '/api/duo/status') data = { linked: false };
    else if (path === '/api/draft/recommend') data = { recommendations: [recommendation(champions[0], 2.1, 1.2, true), recommendation(champions[1], -2.1)], reference_mean: 0, top_group_ids: [103], rank_bucket: null, data_status: { patch: '16.17', rank: 'emerald_plus', meta_available: false, wpa_available: false } };
    else if (path === '/api/draft/compare') {
      const left = recommendation(champions[0], 2.1), right = recommendation(champions[1], -2.1);
      data = { left, right, score_delta: 4.2, combined_sd: 1.7, tied: false, dimensions: [{ dimension: 'composition', left: 0.5, right: 0, delta: 0.5 }], wpa_delta_pp: null, explanation: 'Même contexte pour les deux choix.' };
    } else if (path === '/api/pool/advice') data = { covered: ['dégâts magiques'], gaps: ['réponse à la mobilité'], suggestions: [{ champion_id: 61, champion_key: 'Orianna', champion_name: 'Orianna', reason: 'Exemple de complémentarité pour le parcours.', learning_plan: ['Apprendre les échanges.'] }], method: 'Kits', note: 'Test simulé' };
    else if (path === '/api/history' && req.method() === 'POST') { const body = req.postDataJSON(); data = { ...body, id: 'history-1', timestamp: '2026-09-09T10:00:00Z' }; history = [data]; }
    else if (path === '/api/history') data = history.map(({ timeline, ...entry }) => ({ ...entry, timeline_steps: timeline.length }));
    else if (path.startsWith('/api/history/')) data = history.find(e => path.endsWith(e.id)) || {};
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'DRAFT', exact: true })).toBeVisible();
});

async function pick(page, slot, name) {
  await page.getByRole('button', { name: slot, exact: true }).click();
  await page.getByRole('textbox', { name: 'Rechercher un champion', exact: true }).fill(name);
  await page.getByText(name.toUpperCase(), { exact: true }).click();
}

test('manual editing, automatic analysis, comparison and refresh after a change', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const analyses = []; page.on('request', req => { if (req.url().endsWith('/api/draft/recommend')) analyses.push(req.postDataJSON().draft_state); });
  await pick(page, 'red P1 : vide', 'Jarvan IV');
  // No click on ANALYSER: each pick launches the analysis on its own.
  await expect(page.getByText('+2.1', { exact: false }).first()).toBeVisible();
  expect(analyses).toHaveLength(1);
  expect(analyses[0].enemy_picks.map(p => p.champion_id)).toEqual([59]);
  await expect(page.getByText('WPA indisponible', { exact: false }).first()).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Comparer deux champions' }).click();
  await page.getByLabel('Champion A', { exact: true }).selectOption('103');
  await page.getByLabel('Champion B', { exact: true }).selectOption('61');
  await page.getByRole('button', { name: 'Comparer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ahri est préféré de 4.2 points de win rate' })).toBeVisible();
  await page.screenshot({ path: 'test-results/comparaison.png', fullPage: true });
  await page.locator('summary').filter({ hasText: 'Comparer deux champions' }).click();
  await page.getByRole('button', { name: 'red P1 : Jarvan IV', exact: true }).click();
  await page.getByRole('button', { name: 'Vider cet emplacement' }).click();
  await expect(page.getByRole('button', { name: 'red P1 : vide' })).toBeVisible();
  // The edit makes the advice stale, then a new analysis refreshes it without a click.
  await expect.poll(() => analyses.length).toBe(2);
  expect(analyses[1].enemy_picks).toEqual([]);
  await expect(page.getByText('La draft a changé', { exact: false })).toBeHidden();
  // ANALYSER still relaunches it by hand.
  await page.getByRole('button', { name: 'ANALYSER', exact: true }).click();
  await expect.poll(() => analyses.length).toBe(3);
  expect(errors).toEqual([]);
});

test('a preference change refreshes the advice without a click', async ({ page }) => {
  const analyses = []; page.on('request', req => { if (req.url().endsWith('/api/draft/recommend')) analyses.push(req.postDataJSON()); });
  await pick(page, 'red P1 : vide', 'Jarvan IV');
  await expect(page.getByText('+2.1', { exact: false }).first()).toBeVisible();
  await page.getByRole('button', { name: 'PARAMÈTRES', exact: true }).click();
  await page.getByLabel('Mon rang', { exact: true }).selectOption('gold');
  await expect.poll(() => analyses.length).toBe(2);
  expect(analyses[1].rank_bucket).toBe('gold');
  await page.getByRole('button', { name: 'DRAFT', exact: true }).click();
  await expect(page.getByText('La draft a changé', { exact: false })).toBeHidden();
  await expect(page.getByText('+2.1', { exact: false }).first()).toBeVisible();
});

test('pool advice adds a champion at the learning tier', async ({ page }) => {
  await page.getByRole('button', { name: 'POOL', exact: true }).click();
  await page.locator('summary').filter({ hasText: 'Améliorer mon pool' }).click();
  await page.getByRole('button', { name: 'Identifier les manques' }).click();
  await expect(page.getByText('Options manquantes :', { exact: false })).toBeVisible();
  const save = page.waitForRequest(req => req.url().endsWith('/api/user/pool') && req.method() === 'POST');
  await page.getByRole('button', { name: 'Ajouter au niveau D — à apprendre' }).click();
  const request = await save;
  expect(request.postDataJSON().entries).toContainEqual({ champion_id: 61, champion_key: 'Orianna', tier: 'D' });
});

test('save and replay a draft without future information', async ({ page }) => {
  await pick(page, 'blue mid : vide', 'Ahri');
  await pick(page, 'red P1 : vide', 'Jarvan IV');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('Draft enregistrée dans Replays.')).toBeVisible();
  await page.getByRole('button', { name: 'REPLAYS', exact: true }).click();
  await page.getByRole('button', { name: 'Rejouer', exact: true }).click();
  await expect(page.getByText('Étape 1 / 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'blue mid : vide' })).toBeVisible();
  await page.getByRole('button', { name: 'Étape suivante' }).click();
  await expect(page.getByRole('button', { name: 'blue mid : Ahri' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'red P1 : vide' })).toBeVisible();
  await page.getByRole('button', { name: 'Tester une variante' }).click();
  await expect(page.getByRole('button', { name: 'Étape suivante' })).toHaveCount(0);
});

test('a champion put by hand is removed from its slot, with the cross or a right click', async ({ page }) => {
  await pick(page, 'red P1 : vide', 'Jarvan IV');
  await pick(page, 'blue top : vide', 'Nasus');
  await page.getByRole('button', { name: 'red P1 : Jarvan IV', exact: true }).hover();
  await page.screenshot({ path: 'test-results/retrait.png', clip: { x: 0, y: 40, width: 1280, height: 90 } });
  await page.getByRole('button', { name: 'Retirer Jarvan IV', exact: true }).click();
  await expect(page.getByRole('button', { name: 'red P1 : vide', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'blue top : Nasus', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'blue top : vide', exact: true })).toBeVisible();
});
