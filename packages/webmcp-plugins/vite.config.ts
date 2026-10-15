import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/consent.ts', 'src/otel.ts'],
    platform: 'browser',
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    tsconfig: './tsconfig.json',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
