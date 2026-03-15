import path from 'node:path';
import { defineConfig } from 'vite-plus';

const __dirname = import.meta.dirname;

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    dts: true,
    format: ['esm'],
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'esnext',
    platform: 'browser',
    // Bundle @modelcontextprotocol/sdk into the output so consumers don't
    // inherit its CJS-only ajv dependency. The ajv/ajv-formats imports are
    // aliased to browser-safe no-op stubs (see src/stubs/).
    external: [
      /^zod/, // zod, zod/v4, zod-to-json-schema
      /^@mcp-b\//, // workspace deps
    ],
    alias: {
      ajv: path.resolve(__dirname, 'src/stubs/ajv.ts'),
      'ajv-formats': path.resolve(__dirname, 'src/stubs/ajv-formats.ts'),
    },
    tsconfig: './tsconfig.json',
  },
});
