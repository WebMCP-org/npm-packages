import { defineConfig, devices, type PlaywrightTestConfig } from '@playwright/test';
import { WEBMCP_CHROME_ARGS } from './chrome-executable.js';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const tabTransportPort = Number.parseInt(process.env.PLAYWRIGHT_TAB_TRANSPORT_PORT ?? '4173', 10);
const tabTransportBaseUrl = `http://localhost:${tabTransportPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
const chromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? process.env.CHROME_BIN;
const enableWebMCPFlags = process.env.PLAYWRIGHT_ENABLE_WEBMCP_FLAGS === '1';
const chromiumUse: NonNullable<PlaywrightTestConfig['use']> = {
  ...devices['Desktop Chrome'],
};
if (chromiumChannel && !chromiumExecutablePath) {
  chromiumUse.channel = chromiumChannel;
}

type ChromiumLaunchOptions = NonNullable<NonNullable<PlaywrightTestConfig['use']>['launchOptions']>;
const launchOptions: ChromiumLaunchOptions = {};
if (chromiumExecutablePath) launchOptions.executablePath = chromiumExecutablePath;
if (enableWebMCPFlags) launchOptions.args = WEBMCP_CHROME_ARGS;
if (chromiumExecutablePath || enableWebMCPFlags) {
  chromiumUse.launchOptions = launchOptions;
}

const config: PlaywrightTestConfig = {
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html'], ['list'], ...(process.env.CI ? [['github'] as const] : [])],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: tabTransportBaseUrl,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    { name: 'chromium', use: chromiumUse },

    // Uncomment to test on other browsers
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: `pnpm --filter mcp-tab-transport-test-app exec vp dev --host 0.0.0.0 --port ${tabTransportPort}`,
    url: tabTransportBaseUrl,
    reuseExistingServer,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
};

if (process.env.CI) config.workers = 1;

export default defineConfig(config);
