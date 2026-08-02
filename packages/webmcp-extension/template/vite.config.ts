import { cpSync } from 'node:fs';
import type { PackUserConfig } from 'vite-plus/pack';
import { defineConfig } from 'vite-plus';

const common: PackUserConfig = {
  format: ['iife'],
  outDir: 'dist',
  dts: false,
  sourcemap: true,
  treeshake: true,
  minify: true,
  target: 'chrome111',
  platform: 'browser',
  deps: { alwaysBundle: [/.*/] },
  tsconfig: './tsconfig.json',
};

export default defineConfig({
  pack: [
    {
      ...common,
      name: 'main-world',
      entry: { 'main-world': 'src/main-world.ts' },
      globalName: 'WebMCPExtensionMainWorld',
      clean: true,
    },
    {
      ...common,
      name: 'content-script',
      entry: { 'content-script': 'src/content-script.ts' },
      globalName: 'WebMCPExtensionContentScript',
      clean: false,
      onSuccess: async () => cpSync('manifest.json', 'dist/manifest.json'),
    },
  ],
});
