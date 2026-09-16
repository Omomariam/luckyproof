import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  use: { baseURL: 'http://localhost:3000', channel: 'msedge', headless: true },
  webServer: { command: 'node server.mjs', url: 'http://localhost:3000', reuseExistingServer: true },
  reporter: 'list'
});
