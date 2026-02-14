import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Native Web Standards Showcase
 * Launches Chromium with --enable-experimental-web-platform-features
 */
const tabTransportPort = Number.parseInt(process.env.PLAYWRIGHT_NATIVE_SHOWCASE_PORT ?? '5174', 10);
const nativeShowcaseBaseUrl = `http://localhost:${tabTransportPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/native-showcase.spec.ts',
  fullyParallel: false, // Run tests sequentially for stability
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: nativeShowcaseBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // CRITICAL: Launch with experimental web platform features enabled
    launchOptions: {
      args: ['--enable-experimental-web-platform-features', '--enable-features=WebMCPForTesting'],
    },
  },

  projects: [
    {
      name: 'chromium-native',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome-beta',
      },
    },
  ],

  webServer: {
    command: `cd web-standards-showcase && pnpm dev --host 127.0.0.1 --port ${tabTransportPort}`,
    url: nativeShowcaseBaseUrl,
    reuseExistingServer,
    timeout: 120 * 1000,
  },
});
