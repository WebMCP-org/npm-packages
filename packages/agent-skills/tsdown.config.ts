import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  external: [],
  noExternal: ['yaml'],
  tsconfig: './tsconfig.json',
});
