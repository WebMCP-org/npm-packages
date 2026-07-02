import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Chrome 152 native WebMCP verification.
 */
const tabTransportPort = Number.parseInt(process.env.PLAYWRIGHT_TAB_TRANSPORT_PORT ?? '4173', 10);
const tabTransportBaseUrl = `http://localhost:${tabTransportPort}`;
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
const MIN_NATIVE_CHROME_MAJOR = 152;
const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
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
    `Native WebMCP tests require Chrome ${MIN_NATIVE_CHROME_MAJOR}+. Set CHROME_BIN or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.`
  );
}

const chromeExecutablePath = resolveNativeChrome();

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
