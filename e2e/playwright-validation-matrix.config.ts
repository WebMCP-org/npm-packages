import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for Validation Matrix tests
 *
 * This config starts all test apps and runs validation tests across
 * all Zod/build/framework combinations.
 */
export default defineConfig({
  testDir: './tests',
  testMatch: '**/validation-matrix.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: false, // Run sequentially to avoid port conflicts
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Use single worker for sequential execution */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html'], ['list'], ...(process.env.CI ? [['github'] as const] : [])],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run all test app servers before starting the tests */
  webServer: [
    // IIFE apps (serve static HTML via Vite)
    {
      command: 'pnpm --filter vanilla-iife-json-test-app dev',
      url: 'http://localhost:3010',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter vanilla-iife-zod3-test-app dev',
      url: 'http://localhost:3011',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter vanilla-iife-zod4-test-app dev',
      url: 'http://localhost:3012',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    // ESM apps (Vite with bundling)
    {
      command: 'pnpm --filter vanilla-esm-zod3-test-app dev',
      url: 'http://localhost:3013',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter vanilla-esm-zod4-test-app dev',
      url: 'http://localhost:3014',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    // React apps
    {
      command: 'pnpm --filter react18-zod3-test-app dev',
      url: 'http://localhost:3015',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'pnpm --filter react-webmcp-test-app dev',
      url: 'http://localhost:8888',
      reuseExistingServer: !process.env.CI,
      timeout: 60 * 1000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
