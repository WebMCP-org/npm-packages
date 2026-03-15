import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: true,
    target: 'esnext',
    platform: 'browser',
    external: [],
    tsconfig: './tsconfig.json',
  },
});
