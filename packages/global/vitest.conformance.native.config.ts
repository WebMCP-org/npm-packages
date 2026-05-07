import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isCI = process.env.CI === 'true';
const MIN_NATIVE_CHROME_MAJOR = 149;
const REQUIRED_WEBMCP_FEATURES = ['WebMCPTesting', 'DevToolsWebMCPSupport'];

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev',
  '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome-unstable',
  '/usr/bin/google-chrome-beta',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
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
  return match ? Number.parseInt(match[1], 10) : undefined;
}

function resolveChrome149(): { executablePath: string; version: string } {
  const explicitChromeBin = process.env.CHROME_BIN;

  for (const executablePath of chromeCandidates) {
    if (!existsSync(executablePath)) {
      continue;
    }

    const version = readChromeVersion(executablePath);
    const major = majorFromVersion(version);
    if (major !== undefined && major >= MIN_NATIVE_CHROME_MAJOR) {
      return { executablePath, version: version ?? executablePath };
    }

    if (explicitChromeBin && executablePath === explicitChromeBin) {
      throw new Error(
        `Native conformance requires Chrome ${MIN_NATIVE_CHROME_MAJOR}+; CHROME_BIN resolved to ${version ?? executablePath}.`
      );
    }
  }

  throw new Error(
    `Native conformance requires Chrome ${MIN_NATIVE_CHROME_MAJOR}+ with WebMCP support. Set CHROME_BIN to a Chrome Dev/Canary executable.`
  );
}

function resolveChromeFlags(): string[] {
  const rawFlags = process.env.CHROME_FLAGS?.split(/\s+/).filter(Boolean) ?? [];
  const features = new Set(REQUIRED_WEBMCP_FEATURES);
  const passthroughFlags: string[] = [];

  for (const flag of rawFlags) {
    if (flag.startsWith('--enable-features=')) {
      for (const feature of flag.slice('--enable-features='.length).split(',')) {
        if (feature) {
          features.add(feature);
        }
      }
      continue;
    }

    passthroughFlags.push(flag);
  }

  return [...passthroughFlags, `--enable-features=${[...features].join(',')}`];
}

const nativeChrome = resolveChrome149();
const chromeFlags = resolveChromeFlags();

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          executablePath: nativeChrome.executablePath,
          args: chromeFlags,
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
    include: ['conformance/native-runtime.e2e.test.ts'],
    exclude: ['dist', 'node_modules'],
    globals: true,
    maxConcurrency: isCI ? 1 : 2,
    fileParallelism: false,
  },
});
