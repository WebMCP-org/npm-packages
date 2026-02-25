import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist', 'node_modules', 'src/**/*.e2e.test.ts'],
    globals: true,
  },
});
