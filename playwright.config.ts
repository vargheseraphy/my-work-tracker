import { defineConfig, devices } from '@playwright/test';

/**
 * Browser journeys J1 to J12 (docs/TESTING.md), at 1440x900 and 390x844.
 *
 * The suite drives the real app against the real database, so it reseeds first and runs its
 * files one at a time.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
      testMatch: /responsive|accessibility/,
    },
  ],

  /**
   * Playwright starts its own pair of servers rather than reusing a running one, because the
   * suite signs in far more often than the real limit of 20 auth requests per 15 minutes allows.
   * The limit itself is unchanged in .env and is tested on its own in
   * apps/server/src/auth/rate-limit.test.ts.
   */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173/api/health',
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      AUTH_RATE_LIMIT: '100000',
      // Reminder emails during a browser run would just add noise.
      JOBS_ENABLED: 'false',
    } as Record<string, string>,
  },
});
