import { test, expect } from '@playwright/test';

// The installer ships this build, not the dev server: it must start and show a screen.
test('the production build starts on the login screen without a script error', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'SE CONNECTER' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
