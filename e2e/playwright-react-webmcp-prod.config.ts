import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const chromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
const chromiumUse: NonNullable<PlaywrightTestConfig['use']> = {
  ...devices['Desktop Chrome'],
  launchOptions: { args: ['--disable-features=WebMCP'] },
};
if (chromiumChannel) chromiumUse.channel = chromiumChannel;

/**
 * Playwright config for React WebMCP production build tests.
 * This tests against a minified production build to verify polyfill detection
 * works correctly even when class names are minified.
 */
const config: PlaywrightTestConfig = {
  testDir: './tests',
  testMatch: '**/react-webmcp-production.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['list'], ...(process.env.CI ? [['github'] as const] : [])],
  use: {
    baseURL: 'http://localhost:8889',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: chromiumUse }],

  /* Build and preview production build */
  webServer: {
    command:
      'pnpm --filter react-webmcp-test-app build && pnpm --filter react-webmcp-test-app preview --port 8889',
    url: 'http://localhost:8889',
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
};

if (process.env.CI) config.workers = 1;

export default defineConfig(config);
