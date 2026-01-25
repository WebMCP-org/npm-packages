import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'browser',
  dts: true,
  minify: process.env.NODE_ENV === 'prod',
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Don't bundle peer dependencies or the main package
  external: ['react', 'react/jsx-runtime', 'react-dom', 'zod', '@mcp-b/react-webmcp'],
  tsconfig: './tsconfig.json',
});
