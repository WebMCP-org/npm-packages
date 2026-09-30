import { defineConfig, devices } from '@playwright/test';
import {
  MACOS_CHROME_EXECUTABLE_PATHS,
  MIN_NATIVE_CHROME_MAJOR,
  resolveChromeExecutable,
  WEBMCP_CHROME_ARGS,
} from './chrome-executable.js';

/**
 * Playwright configuration for Native Web Standards Showcase
 * Launches a browser with --enable-experimental-web-platform-features.
 * Defaults to an installed Chrome 155+ because WebMCP's document.modelContext
 * surface is not available in Playwright's bundled Chromium.
 */
const showcasePort = Number.parseInt(process.env.PLAYWRIGHT_NATIVE_SHOWCASE_PORT ?? '5174', 10);
const nativeShowcaseBaseUrl = `http://localhost:${showcasePort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
const nativeShowcaseExecutablePath = resolveChromeExecutable({
  candidates: [
    process.env.PLAYWRIGHT_NATIVE_SHOWCASE_EXECUTABLE_PATH,
    process.env.CHROME_BIN,
    ...MACOS_CHROME_EXECUTABLE_PATHS,
  ],
  minimumMajor: MIN_NATIVE_CHROME_MAJOR,
  unresolvedError: () =>
    new Error(
      `Native showcase requires Chrome ${MIN_NATIVE_CHROME_MAJOR}+ with WebMCP support. Set CHROME_BIN or PLAYWRIGHT_NATIVE_SHOWCASE_EXECUTABLE_PATH.`
    ),
}).executablePath;

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
    launchOptions: {
      executablePath: nativeShowcaseExecutablePath,
      args: WEBMCP_CHROME_ARGS,
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
    command: `cd web-standards-showcase && pnpm dev --host 127.0.0.1 --port ${showcasePort}`,
    url: nativeShowcaseBaseUrl,
    reuseExistingServer,
    timeout: 120 * 1000,
  },
});
