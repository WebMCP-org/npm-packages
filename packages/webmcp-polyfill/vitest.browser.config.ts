import { playwright } from 'vite-plus/test/browser-playwright';
import { defineConfig } from 'vite-plus';

const isCI = process.env.CI === 'true';

export default defineConfig({
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
    maxConcurrency: isCI ? 1 : 2,
    fileParallelism: false,
  },
});
