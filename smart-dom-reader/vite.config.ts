import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/inject.ts',
      userscript: {
        name: 'Smart DOM Reader',
        match: ['*'],
      },
      build: {
        fileName: 'index.js',
        metaFileName: false,
        autoGrant: false,
        externalGlobals: {},
        externalResource: {},
      },
    }),
  ],
  build: {
    minify: true,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'SmartDOMReader',
        inlineDynamicImports: true,
        extend: true,
      },
    },
    target: 'esnext',
    sourcemap: false,
  },
});
