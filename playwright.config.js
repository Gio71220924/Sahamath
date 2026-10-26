// Tes e2e (Playwright) atas hasil build Vercel. Jalankan: npm run test:e2e
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    reducedMotion: 'reduce',   // angka hasil kalkulator langsung final, tanpa animasi
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'hp', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }, testMatch: /mobile\.spec/ },
  ],
  webServer: {
    command: `npm run build:static && node tests/e2e/static-server.js`,
    url: `http://localhost:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
