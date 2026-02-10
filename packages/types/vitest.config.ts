import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
    },
    include: ['src/**/*.test-d.ts'],
    globals: true,
  },
});
