import { test, expect } from '@playwright/test';
const champions = [
  { id: 103, key: 'Ahri', name: 'Ahri', roles: ['mid'] }, { id: 61, key: 'Orianna', name: 'Orianna', roles: ['mid'] },
  { id: 78, key: 'Poppy', name: 'Poppy', roles: ['top', 'jungle', 'support'] },
  { id: 59, key: 'JarvanIV', name: 'Jarvan IV', roles: ['jungle'] }, { id: 75, key: 'Nasus', name: 'Nasus', roles: ['top'] },
];
const recommendation = (champion, score) => ({ champion_id: champion.id, champion_key: champion.key, champion_name: champion.name,
  total_score: score, score_range: null, confidence: 35, breakdown: { meta: 55, matchup: 60, synergy: 50, composition: 65, mastery: 72, draft_risk: 50, mechanics: 0, wpa_adjustment: 0, ml_explanation: null },
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
    else if (path === '/api/draft/recommend') data = { recommendations: [recommendation(champions[0], 72), recommendation(champions[1], 68)], data_status: { patch: '16.17', rank: 'master_plus', meta_available: false, wpa_available: false } };
    else if (path === '/api/draft/compare') {
      const left = recommendation(champions[0], 72), right = recommendation(champions[1], 68);
      data = { left, right, score_delta: 4, dimensions: [{ dimension: 'composition', left: 65, right: 60, delta: 5 }], wpa_delta_pp: null, explanation: 'Même contexte pour les deux choix.' };
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

test('manual editing, analysis, comparison and stale results', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await pick(page, 'red P1 : vide', 'Jarvan IV');
  await page.getByRole('button', { name: 'ANALYSER', exact: true }).click();
  await expect(page.getByText('WPA indisponible', { exact: false }).first()).toBeVisible();
  await page.locator('summary').filter({ hasText: 'Comparer deux champions' }).click();
  await page.getByLabel('Champion A', { exact: true }).selectOption('103');
  await page.getByLabel('Champion B', { exact: true }).selectOption('61');
  await page.getByRole('button', { name: 'Comparer', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ahri est préféré de 4.0 points' })).toBeVisible();
  await page.screenshot({ path: 'test-results/comparaison.png', fullPage: true });
  await page.locator('summary').filter({ hasText: 'Comparer deux champions' }).click();
  await page.getByRole('button', { name: 'red P1 : Jarvan IV', exact: true }).click();
  await page.getByRole('button', { name: 'Vider cet emplacement' }).click();
  await expect(page.getByText('La draft a changé', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'red P1 : vide' })).toBeVisible();
  expect(errors).toEqual([]);
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
