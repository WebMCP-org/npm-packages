import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: {
      index: 'src/invocation.ts',
      'standard-schema': 'src/standard-schema.ts',
      'execution-state': 'src/execution-state.ts',
      consent: 'src/consent.ts',
      'consent-guard': 'src/consent-guard.ts',
      'consent-presence': 'src/consent-presence.ts',
      'consent-types': 'src/consent-types.ts',
      'consent-annotations': 'src/consent-annotations.ts',
      otel: 'src/otel.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'esnext',
    platform: 'browser',
    tsconfig: './tsconfig.json',
    outDir: 'dist',
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {},
      }),
      instances: [{ browser: 'chromium' }],
    },
    include: ['src/**/*.test.ts'],
    exclude: ['dist', 'node_modules'],
    globals: true,
    maxConcurrency: process.env.CI === 'true' ? 1 : 2,
    fileParallelism: false,
  },
});
