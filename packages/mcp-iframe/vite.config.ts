import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    dts: true,
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: true,
    target: 'esnext',
    platform: 'browser',
    external: ['@modelcontextprotocol/sdk'],
    tsconfig: './tsconfig.json',
  },
});
