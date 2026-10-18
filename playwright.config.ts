import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', timeout: 30000, fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1366, height: 900 }, launchOptions: { ...(process.env.PLAYBOOK_CHROMIUM_PATH ? { executablePath: process.env.PLAYBOOK_CHROMIUM_PATH } : {}) } },
  webServer: { command: 'npx vite --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
