import { playwright } from 'vite-plus/test/browser-playwright';
import type { Options } from 'vite-plus/pack';
import { defineConfig } from 'vite-plus';

const isBrowserRun = process.env.VITEST_BROWSER === 'true';

const isCI = process.env.CI === 'true';

const mainConfig: Options = {
  name: 'main',
  entry: ['src/index.ts'],
  dts: true,
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: true,
  target: 'esnext',
  platform: 'browser',
  tsconfig: './tsconfig.json',
};

const e2eExtensionConfig: Options = {
  name: 'e2e-extension',
  entry: {
    background: './e2e/extension/background.ts',
    client: './e2e/extension/client.ts',
  },
  outDir: './e2e/dist/extension',
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: false,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  deps: {
    alwaysBundle: [/.*/],
  },
  tsconfig: './e2e/tsconfig.extension.json',
};

export default defineConfig({
  pack: [mainConfig, e2eExtensionConfig],
  test: {
    browser: {
      enabled: isBrowserRun,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
      headless: true,
    },
    include: isBrowserRun
      ? ['src/**/*.browser.test.ts', 'src/**/*.browser.spec.ts']
      : ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      'dist',
      'node_modules',
      ...(isBrowserRun ? [] : ['src/**/*.browser.test.ts', 'src/**/*.browser.spec.ts']),
    ],
    globals: true,
    // Limit concurrency in CI to prevent resource exhaustion
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
