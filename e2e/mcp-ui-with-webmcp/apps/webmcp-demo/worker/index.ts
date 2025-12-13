import { Hono } from 'hono';

const app = new Hono();

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export the Hono app as the default export for Cloudflare Workers
export default app;
