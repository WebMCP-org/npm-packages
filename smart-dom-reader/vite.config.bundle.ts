import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist-bundle',
    lib: {
      entry: resolve(__dirname, 'src/bundle-entry.ts'),
      formats: ['iife'],
      name: 'SmartDOMReaderBundle',
      fileName: () => 'smart-dom-reader-bundle.js',
    },
    rollupOptions: {
      output: {
        format: 'iife',
        strict: false,
        // Don't use any globals
        globals: {},
      },
    },
    minify: false,
    sourcemap: false,
    // Inline all dependencies
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});
