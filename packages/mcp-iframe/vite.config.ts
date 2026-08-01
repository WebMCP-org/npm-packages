import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/element.ts'],
    dts: true,
    format: ['esm'],
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: true,
    target: 'esnext',
    platform: 'browser',
    tsconfig: './tsconfig.json',
  },
});
