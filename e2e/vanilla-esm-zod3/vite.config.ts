import { defineConfig } from 'vite-plus';

export default defineConfig({
  server: {
    port: 3013,
    strictPort: true,
  },
  preview: {
    port: 3013,
    strictPort: true,
  },
});
