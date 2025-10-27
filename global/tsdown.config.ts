import type { Options } from 'tsdown';

// ESM build for npm package
const esmConfig: Options = {
  entry: 'src/index.ts',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  external: ['@mcp-b/transports', '@mcp-b/webmcp-ts-sdk'],
  tsconfig: './tsconfig.json',
  outDir: 'dist',
};

// IIFE build for script tag usage - bundles everything for standalone use
// Uses index.ts which auto-initializes on load
const iifeConfig: Options = {
  entry: {
    index: 'src/index.ts',
  },
  format: ['iife'],
  dts: false,
  sourcemap: false,
  clean: false, // Don't clean since ESM build runs first
  treeshake: true,
  minify: true,
  target: 'esnext',
  platform: 'browser',
  external: [], // Bundle everything - no externals for standalone script
  noExternal: [/.*/], // Explicitly bundle all dependencies
  tsconfig: './tsconfig.json',
  outDir: 'dist',
  globalName: 'WebMCP',
  outExtensions: () => ({ js: '.js' }),
  onSuccess: async () => {
    console.log('✓ IIFE build complete - auto-initializes on load');
  },
};

export default [esmConfig, iifeConfig];
