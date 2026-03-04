import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3011,
    strictPort: true,
    fs: {
      // Allow serving files from node_modules
      allow: [resolve(__dirname, 'node_modules'), resolve(__dirname, '.')],
    },
  },
  preview: {
    port: 3011,
    strictPort: true,
  },
});
