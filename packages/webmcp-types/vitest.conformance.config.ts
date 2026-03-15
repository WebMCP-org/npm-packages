import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.conformance.json',
      include: ['src/**/*.conformance-d.ts'],
    },
    include: ['src/**/*.conformance-d.ts'],
    globals: true,
  },
});
