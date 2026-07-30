import { defineConfig, devices } from '@playwright/test';
import { MACOS_CHROME_EXECUTABLE_PATHS, resolveChromeExecutable } from './chrome-executable.js';

/**
 * Playwright configuration for Chrome 152 native WebMCP verification.
 */
const tabTransportPort = Number.parseInt(process.env.PLAYWRIGHT_TAB_TRANSPORT_PORT ?? '4173', 10);
const tabTransportBaseUrl = `http://localhost:${tabTransportPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
const MIN_NATIVE_CHROME_MAJOR = 152;
const chromeExecutablePath = resolveChromeExecutable({
  candidates: [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    ...MACOS_CHROME_EXECUTABLE_PATHS,
  ],
  minimumMajor: MIN_NATIVE_CHROME_MAJOR,
  unresolvedError: () =>
    new Error(
      `Native WebMCP tests require Chrome ${MIN_NATIVE_CHROME_MAJOR}+. Set CHROME_BIN or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.`
    ),
}).executablePath;

export default defineConfig({
  testDir: './tests',
  testMatch: [
    '**/chrome-beta-webmcp.spec.ts',
    '**/codemode-webmcp.spec.ts',
    '**/runtime-contract-native.spec.ts',
  ],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: tabTransportBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: chromeExecutablePath,
      args: [
        '--enable-experimental-web-platform-features',
        '--enable-features=WebMCPTesting,DevToolsWebMCPSupport',
      ],
    },
  },

  projects: [
    {
      name: 'chrome-m152-webmcp',
      use: {
        ...devices['Desktop Chrome'],
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
