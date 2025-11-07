/**
 * Cloudflare Worker for Web Standards Showcase
 * Simple static asset server with SPA routing
 */

export default {
  async fetch() {
    // The @cloudflare/vite-plugin handles all static asset serving
    // This is just a minimal worker entry point
    return new Response('Worker loaded', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
