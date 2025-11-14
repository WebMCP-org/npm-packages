import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'browser',
  format: 'esm',
  dts: true,
  // Enable minification for production builds
  minify: process.env.NODE_ENV === 'prod',
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Target modern browsers that support File System Access API
  // File System Access API requires Chrome 86+, Edge 86+, Opera 72+
  target: ['chrome86', 'edge86', 'opera72'],
  // We don't want to bundle these with the library,
  // as the consuming project will provide them.
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  tsconfig: './tsconfig.json',
});
