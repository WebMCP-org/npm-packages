import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    typecheck: {
      enabled: true,
      only: true,
      tsconfig: './tsconfig.json',
      include: ['src/**/*.test-d.ts'],
    },
    include: ['src/**/*.test-d.ts'],
  },
});
