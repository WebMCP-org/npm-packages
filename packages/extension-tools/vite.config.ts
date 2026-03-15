import type { Options } from 'vite-plus/pack';
import { defineConfig } from 'vite-plus';

const mainConfig: Options = {
  name: 'main',
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
};

const e2eExtensionConfig: Options = {
  name: 'e2e-extension',
  entry: {
    background: './e2e/extension/background.ts',
    client: './e2e/extension/client.ts',
  },
  outDir: './dist/e2e-extension',
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: false,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  external: [],
  noExternal: [/.*/],
  tsconfig: './e2e/tsconfig.extension.json',
};

export default defineConfig({
  pack: [mainConfig, e2eExtensionConfig],
});
