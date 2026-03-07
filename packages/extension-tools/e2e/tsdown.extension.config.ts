import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    background: './e2e/extension/background.ts',
    client: './e2e/extension/client.ts',
  },
  outDir: './dist/e2e-extension',
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  external: [],
  noExternal: [/.*/],
  tsconfig: './e2e/tsconfig.extension.json',
});
