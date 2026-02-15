import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const isCI = process.env.CI === 'true';

if (!process.env.CHROME_BIN) {
  throw new Error(
    'CHROME_BIN is required for native conformance tests (point it to Chrome Beta executable).'
  );
}

if (!process.env.CHROME_FLAGS) {
  throw new Error(
    'CHROME_FLAGS is required for native conformance tests. Recommended: "--enable-experimental-web-platform-features --enable-features=WebMCPTesting".'
  );
}

const chromeFlags = process.env.CHROME_FLAGS.split(/\s+/).filter(Boolean);

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright({
        launchOptions: {
          executablePath: process.env.CHROME_BIN,
          args: chromeFlags,
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
    include: ['src/conformance/native-runtime.e2e.test.ts'],
    exclude: ['dist', 'node_modules'],
    globals: true,
    maxConcurrency: isCI ? 1 : 2,
    fileParallelism: false,
  },
});
