import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  dts: true,
  format: ['esm'],
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'node22',
  platform: 'node',
  external: [],
  tsconfig: './tsconfig.json',
});
