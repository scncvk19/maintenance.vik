import { defineConfig } from '@playwright/test';

// The full workflow test imports a baseline backup, then REPLACES the entire
// database with it. Never let a normal `playwright test` run it by accident.
// Only opt in when TEST_URL points to a dedicated, disposable test deployment.
const destructiveTestEnabled =
  process.env.TEST_ALLOW_DESTRUCTIVE === 'YES_ISOLATED_TEST_DATA' &&
  Boolean(process.env.TEST_URL);

export default defineConfig({
  testDir: './tests',
  workers: 1,
  timeout: 45000,
  grepInvert: destructiveTestEnabled
    ? undefined
    : /Bestand, Wartung, Finanzen, Dokumente und Backup über die Oberfläche/,
  use: {
    baseURL: process.env.TEST_URL || 'http://127.0.0.1:3000',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
