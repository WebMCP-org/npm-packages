import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
      include: ['src/**/*.test-d.ts'],
      exclude: ['src/**/*.conformance-d.ts'],
    },
    include: ['src/**/*.test-d.ts'],
    exclude: ['src/**/*.conformance-d.ts'],
    globals: true,
  },
});
