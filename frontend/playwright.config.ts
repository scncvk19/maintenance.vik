import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', workers: 1, timeout: 45000,
  use: { baseURL: process.env.TEST_URL || 'http://127.0.0.1:3000', reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
});
