import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/index.ts',
      userscript: {
        name: 'MCP-B Global',
        match: ['*'],
      },
      build: {
        fileName: 'index.js',
        metaFileName: false,
        autoGrant: false,
        externalGlobals: {},
      },
    }),
  ],
  build: {
    minify: true,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
    target: 'esnext',
    sourcemap: false,
  },
});
