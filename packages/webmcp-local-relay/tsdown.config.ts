import type { Options } from 'tsdown';

const nodeConfig: Options = {
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
};

// Shared browser build options
const browserBase: Partial<Options> = {
  format: ['iife'],
  platform: 'browser',
  target: 'es2020',
  outDir: 'dist/browser',
  splitting: false,
  noExternal: [/.*/],
  treeshake: true,
  minify: true,
  dts: false,
  clean: false,
  sourcemap: false,
  tsconfig: './tsconfig.browser.json',
};

// IIFE build for embed.js — self-contained script tag for host pages
const embedConfig: Options = {
  ...browserBase,
  entry: { embed: 'src/browser/embed.ts' },
};

// IIFE build for widget.js — bundled into widget.html at post-build
const widgetConfig: Options = {
  ...browserBase,
  entry: { widget: 'src/browser/widget.ts' },
};

export default [nodeConfig, embedConfig, widgetConfig];
