import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/ai.ts', 'src/browser.ts', 'src/webmcp.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  external: [/^ai$/, /^zod/, /^@mcp-b\//],
  noExternal: ['acorn'],
  tsconfig: './tsconfig.json',
});
