import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false, // Don't minify since this is a library wrapper
  target: 'esnext',
  platform: 'browser',
  // External dependencies that should not be bundled
  external: ['@modelcontextprotocol/sdk'],
  tsconfig: './tsconfig.json',
});
