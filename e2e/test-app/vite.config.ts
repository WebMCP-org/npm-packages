import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'runtime-contract': resolve(__dirname, 'runtime-contract.html'),
        'runtime-contract-iframe-child': resolve(__dirname, 'runtime-contract-iframe-child.html'),
        'runtime-contract-iframe-client': resolve(__dirname, 'runtime-contract-iframe-client.html'),
        'mcp-iframe-host': resolve(__dirname, 'mcp-iframe-host.html'),
        'mcp-iframe-client': resolve(__dirname, 'mcp-iframe-client.html'),
        'iframe-child': resolve(__dirname, 'iframe-child.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
});
