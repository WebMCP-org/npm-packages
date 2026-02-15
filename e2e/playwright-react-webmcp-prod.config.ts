import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for React WebMCP production build tests.
 * This tests against a minified production build to verify polyfill detection
 * works correctly even when class names are minified.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/react-webmcp-production.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  ...(process.env.CI ? { workers: 1 } : {}),
  reporter: [['html'], ['list'], ...(process.env.CI ? [['github'] as const] : [])],
  use: {
    baseURL: 'http://localhost:8889',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

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
});
