import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for Node.js-only tests.
 *
 * Some tests need to run in native Node.js environment (not browser) to
 * test things like native ESM resolution, child process spawning, etc.
 */
export default defineConfig({
  test: {
    // Use Node.js environment (not browser)
    environment: 'node',
    // Only include Node-specific tests
    include: ['src/esm-resolution.test.ts'],
    // Enable globals for cleaner test syntax
    globals: true,
  },
});
