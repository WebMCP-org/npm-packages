import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3015,
    strictPort: true,
  },
  preview: {
    port: 3015,
    strictPort: true,
  },
});
