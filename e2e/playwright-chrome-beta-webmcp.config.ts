import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Chrome Beta WebMCP testing-flag verification.
 * Targets Chrome Beta with the current early-preview WebMCP testing feature flag.
 */
const tabTransportPort = Number.parseInt(process.env.PLAYWRIGHT_TAB_TRANSPORT_PORT ?? '4173', 10);
const tabTransportBaseUrl = `http://localhost:${tabTransportPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/chrome-beta-webmcp.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: tabTransportBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: {
      args: [
        // In current Chrome Beta builds, this switch is still required for native exposure.
        '--enable-experimental-web-platform-features',
        '--enable-features=WebMCPTesting',
      ],
    },
  },

  projects: [
    {
      name: 'chrome-beta-webmcp',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome-beta',
      },
    },
  ],

  webServer: {
    command: `pnpm --filter mcp-tab-transport-test-app exec vite --port ${tabTransportPort}`,
    url: tabTransportBaseUrl,
    reuseExistingServer,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
