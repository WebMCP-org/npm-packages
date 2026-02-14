import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'browser',
  dts: true,
  minify: process.env.NODE_ENV === 'prod',
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Don't bundle peer dependencies or type-only dependencies
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'zod',
    '@mcp-b/webmcp-types',
    'zod-to-json-schema',
  ],
  tsconfig: './tsconfig.json',
});
