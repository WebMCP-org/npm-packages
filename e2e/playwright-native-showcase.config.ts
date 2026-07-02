import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Native Web Standards Showcase
 * Launches a browser with --enable-experimental-web-platform-features.
 * Defaults to an installed Chrome 152+ because WebMCP's document.modelContext
 * surface is not available in Playwright's bundled Chromium.
 */
const tabTransportPort = Number.parseInt(process.env.PLAYWRIGHT_NATIVE_SHOWCASE_PORT ?? '5174', 10);
const nativeShowcaseBaseUrl = `http://localhost:${tabTransportPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
const nativeShowcaseChannel = process.env.PLAYWRIGHT_NATIVE_SHOWCASE_CHANNEL;
const MIN_NATIVE_CHROME_MAJOR = 152;
const chromeCandidates = [
  process.env.PLAYWRIGHT_NATIVE_SHOWCASE_EXECUTABLE_PATH,
  process.env.CHROME_BIN,
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((candidate): candidate is string => Boolean(candidate));

function readChromeVersion(executablePath: string): string | undefined {
  try {
    return execFileSync(executablePath, ['--version'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function majorFromVersion(version: string | undefined): number | undefined {
  const match = version?.match(/\b(\d+)\./);
  const major = match?.[1];
  return major ? Number.parseInt(major, 10) : undefined;
}

function resolveNativeChrome(): string {
  for (const executablePath of chromeCandidates) {
    if (!existsSync(executablePath)) {
      continue;
    }

    if ((majorFromVersion(readChromeVersion(executablePath)) ?? 0) >= MIN_NATIVE_CHROME_MAJOR) {
      return executablePath;
    }
  }

  throw new Error(
    `Native showcase requires Chrome ${MIN_NATIVE_CHROME_MAJOR}+ with WebMCP support. Set CHROME_BIN or PLAYWRIGHT_NATIVE_SHOWCASE_EXECUTABLE_PATH.`
  );
}

const nativeShowcaseExecutablePath = resolveNativeChrome();

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

    // CRITICAL: Launch with experimental web platform features enabled
    launchOptions: {
      executablePath: nativeShowcaseExecutablePath,
      args: [
        '--enable-experimental-web-platform-features',
        '--enable-features=WebMCPTesting,DevToolsWebMCPSupport',
      ],
    },
  },

  projects: [
    {
      name: 'chromium-native',
      use: {
        ...devices['Desktop Chrome'],
        ...(nativeShowcaseChannel && !nativeShowcaseExecutablePath
          ? { channel: nativeShowcaseChannel }
          : {}),
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
