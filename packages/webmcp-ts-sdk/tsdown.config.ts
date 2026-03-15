import { promises as fs } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'tsdown';

const __dirname = import.meta.dirname;

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    protocol: 'src/protocol.ts',
  },
  dts: true,
  format: ['esm'],
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  noExternal: [/^@modelcontextprotocol\/sdk/],
  // Bundle @modelcontextprotocol/sdk into the output so consumers don't
  // inherit its CJS-only ajv dependency. The ajv/ajv-formats imports are
  // aliased to browser-safe no-op stubs (see src/stubs/).
  external: [
    'zod',
    /^zod\//,
    /^@mcp-b\//, // workspace deps
  ],
  alias: {
    ajv: path.resolve(__dirname, 'src/stubs/ajv.ts'),
    'ajv-formats': path.resolve(__dirname, 'src/stubs/ajv-formats.ts'),
  },
  hooks: {
    'build:done': async () => {
      const distDir = path.resolve(__dirname, 'dist');
      const entries = await fs.readdir(distDir);
      const dtsFiles = entries.filter((entry) => entry.endsWith('.d.ts'));

      for (const fileName of dtsFiles) {
        const dtsPath = path.join(distDir, fileName);
        const current = await fs.readFile(dtsPath, 'utf8');
        const cleaned = current
          .split('\n')
          .filter(
            (line) => !(fileName === 'index.d.ts' && line.includes('@modelcontextprotocol/sdk'))
          )
          .join('\n')
          .replace(/from "(\.\/[^"]+)\.js";/g, 'from "$1.d.ts";');

        if (cleaned !== current) {
          await fs.writeFile(dtsPath, cleaned);
        }
      }
    },
  },
  tsconfig: './tsconfig.json',
});
