import type { PackUserConfig } from 'vite-plus/pack';
import { defineConfig } from 'vite-plus';

const packageConfig: PackUserConfig = {
  name: 'package',
  entry: {
    'content-script': 'src/content-script.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  deps: {
    neverBundle: ['@mcp-b/transports', '@modelcontextprotocol/client'],
  },
  tsconfig: './tsconfig.json',
  outDir: 'dist',
};

const e2eContentScriptConfig: PackUserConfig = {
  name: 'e2e-content-script',
  entry: { 'content-script': './e2e/extension/content-script.ts' },
  outDir: './e2e/dist/extension',
  format: ['iife'],
  globalName: 'WebMCPExtensionContentScript',
  dts: false,
  sourcemap: true,
  clean: false,
  treeshake: true,
  minify: false,
  target: 'chrome111',
  platform: 'browser',
  deps: { alwaysBundle: [/.*/] },
  tsconfig: './tsconfig.check.json',
};

export default defineConfig({
  pack: [packageConfig, e2eContentScriptConfig],
});
