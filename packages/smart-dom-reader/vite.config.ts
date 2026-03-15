import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts', 'src/bundle-string.ts'],
    format: ['esm'],
    splitting: false,
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist',
    target: 'esnext',
    tsconfig: './tsconfig.json',
  },
});
