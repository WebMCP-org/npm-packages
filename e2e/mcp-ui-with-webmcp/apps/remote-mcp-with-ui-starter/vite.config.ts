import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite Configuration for MCP UI + WebMCP Starter
 *
 * This config handles:
 * 1. React app compilation with react-compiler
 * 2. Multi-entry build (main app + TicTacToe mini-app)
 * 3. Cloudflare Workers integration (dev only - production uses wrangler)
 *
 * Build output:
 * - dist/client/index.html - Main app
 * - dist/client/mini-apps/tictactoe/ - TicTacToe mini-app
 *
 * The Cloudflare plugin is only used for development mode.
 * For production, the client is built with vite, then wrangler
 * builds and deploys the worker separately.
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
    port: 8888,
    strictPort: true,
  },
}));
