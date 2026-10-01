import { defineConfig } from '@playwright/test';
// Two targets: the dev server for the workflows, and the production build for a smoke
// test — a chunk cycle once broke only the build (2.1.2: blank window at launch).
export default defineConfig({ testDir: './e2e', fullyParallel: false, workers: 1,
  use: { viewport: { width: 1440, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined, trace: 'retain-on-failure' },
  projects: [
    { name: 'dev', testIgnore: /production\.spec/, use: { baseURL: 'http://127.0.0.1:1420' } },
    { name: 'production', testMatch: /production\.spec/, use: { baseURL: 'http://127.0.0.1:4173' } },
  ],
  webServer: [
    { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:1420', reuseExistingServer: !process.env.CI },
    { command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173',
      reuseExistingServer: false, timeout: 180000 },
  ],
});
