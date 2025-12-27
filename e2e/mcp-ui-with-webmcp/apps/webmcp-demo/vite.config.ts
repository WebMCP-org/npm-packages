import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite Configuration for WebMCP Demo App
 *
 * This config handles:
 * 1. React app compilation with react-compiler
 * 2. Tailwind CSS integration
 * 3. Cloudflare Workers integration
 */
export default defineConfig(() => ({
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
    tailwindcss(),
    cloudflare(),
  ],
  server: {
    port: 8889,
    strictPort: true,
  },
}));
