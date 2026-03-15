import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    include: ['src/**/*.e2e.test.ts'],
    exclude: ['dist', 'node_modules'],
    globals: true,
    testTimeout: 90_000,
    hookTimeout: 30_000,
  },
});
