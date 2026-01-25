import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const isCI = process.env.CI === 'true';

export default defineConfig({
  test: {
    // Use browser mode for real DOM, postMessage, and navigator testing
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
    // Test file patterns
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Exclude build output
    exclude: ['dist', 'node_modules'],
    // Enable globals for cleaner test syntax
    globals: true,
    // Limit concurrency in CI to prevent resource exhaustion
    maxConcurrency: isCI ? 2 : 10,
    fileParallelism: !isCI,
  },
});
