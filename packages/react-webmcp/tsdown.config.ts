import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'browser',
  dts: true,
  // Enable minification for production builds
  minify: process.env.NODE_ENV === 'prod',
  sourcemap: true,
  clean: true,
  treeshake: true,
  // We don't want to bundle these with the library,
  // as the consuming project will provide them.
  external: ['react', 'react/jsx-runtime', 'react-dom', 'zod'],
  tsconfig: './tsconfig.json',
});
