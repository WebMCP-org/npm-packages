import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Native Web Standards Showcase
 * Launches Chromium with --enable-experimental-web-platform-features
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/native-showcase.spec.ts',
  fullyParallel: false, // Run tests sequentially for stability
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // CRITICAL: Launch with experimental web platform features enabled
    launchOptions: {
      args: ['--enable-experimental-web-platform-features', '--enable-features=WebModelContext'],
    },
  },

  projects: [
    {
      name: 'chromium-native',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],

  webServer: {
    command: 'cd web-standards-showcase && pnpm dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
