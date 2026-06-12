import { defineConfig, devices } from '@playwright/test';

const tabTransportPort = Number.parseInt(process.env.PLAYWRIGHT_TAB_TRANSPORT_PORT ?? '4173', 10);
const tabTransportBaseUrl = `http://localhost:${tabTransportPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
const chromiumChannel = process.env.PLAYWRIGHT_CHROMIUM_CHANNEL;
const chromiumExecutablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? process.env.CHROME_BIN;

export default defineConfig({
  testDir: './tests',
  testMatch: '**/runtime-contract-image-values.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html'], ['list'], ...(process.env.CI ? [['github'] as const] : [])],
  use: {
    baseURL: tabTransportBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
      args: [
        '--enable-experimental-web-platform-features',
        '--enable-features=WebMCPTesting,DevToolsWebMCPSupport',
      ],
    },
  },
  projects: [
    {
      name: 'chromium-webmcp-image-native',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumChannel && !chromiumExecutablePath ? { channel: chromiumChannel } : {}),
      },
    },
  ],
  webServer: {
    command: `pnpm --filter mcp-tab-transport-test-app exec vp dev --port ${tabTransportPort}`,
    url: tabTransportBaseUrl,
    reuseExistingServer,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
