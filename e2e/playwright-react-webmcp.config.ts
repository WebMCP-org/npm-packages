import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';

const chromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
const chromiumUse: NonNullable<PlaywrightTestConfig['use']> = {
  ...devices['Desktop Chrome'],
  launchOptions: { args: ['--disable-features=WebMCP'] },
};
if (chromiumChannel) chromiumUse.channel = chromiumChannel;

/**
 * Playwright config for React WebMCP tests
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './tests',
  testMatch: '**/react-webmcp.spec.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html'], ['list'], ...(process.env.CI ? [['github'] as const] : [])],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:8888',
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [{ name: 'chromium', use: chromiumUse }],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm --filter react-webmcp-test-app dev',
    url: 'http://localhost:8888',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
};

if (process.env.CI) config.workers = 1;

export default defineConfig(config);
