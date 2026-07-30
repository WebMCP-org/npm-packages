import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';
import {
  LINUX_CHROME_EXECUTABLE_PATHS,
  MACOS_CHROME_EXECUTABLE_PATHS,
  resolveChromeExecutable,
} from '../../e2e/chrome-executable.js';

const isCI = process.env.CI === 'true';
const MIN_NATIVE_CHROME_MAJOR = 152;
const REQUIRED_WEBMCP_FEATURES = ['WebMCP', 'DevToolsWebMCPSupport'];

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

const nativeChrome = resolveChromeExecutable({
  candidates: [
    process.env.CHROME_BIN,
    ...MACOS_CHROME_EXECUTABLE_PATHS,
    ...LINUX_CHROME_EXECUTABLE_PATHS,
  ],
  minimumMajor: MIN_NATIVE_CHROME_MAJOR,
  onRejectedCandidate: ({ executablePath, version }) =>
    process.env.CHROME_BIN && executablePath === process.env.CHROME_BIN
      ? new Error(
          `Native conformance requires Chrome ${MIN_NATIVE_CHROME_MAJOR}+; CHROME_BIN resolved to ${version ?? executablePath}.`
        )
      : undefined,
  unresolvedError: () =>
    new Error(
      `Native conformance requires Chrome ${MIN_NATIVE_CHROME_MAJOR}+ with WebMCP support. Set CHROME_BIN to a Chrome Dev/Canary executable.`
    ),
});
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
