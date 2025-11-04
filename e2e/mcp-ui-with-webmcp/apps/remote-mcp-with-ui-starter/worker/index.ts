import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GameStatsStorage } from './gameStatsStorage';
import { MyMCP } from './mcpServer';

export { MyMCP, GameStatsStorage };

/**
 * Hono-based Cloudflare Worker
 * Routes requests to the appropriate MCP endpoints with CORS support
 */
const app = new Hono<{ Bindings: Env }>();

// Apply CORS middleware to all routes
app.use(
  '/*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'X-Anthropic-API-Key', '*'],
    allowMethods: ['*'],
  })
);

// Route SSE (Server-Sent Events) endpoints
app.all('/sse/*', async (c) => {
  return await MyMCP.serveSSE('/sse').fetch(c.req.raw, c.env, c.executionCtx);
});

app.all('/sse', async (c) => {
  return await MyMCP.serveSSE('/sse').fetch(c.req.raw, c.env, c.executionCtx);
});

// Route MCP protocol endpoint
app.all('/mcp', async (c) => {
  return await MyMCP.serve('/mcp').fetch(c.req.raw, c.env, c.executionCtx);
});

// Game statistics API endpoints
// GET /api/stats - Fetch current game statistics
app.get('/api/stats', async (c) => {
  try {
    const id = c.env.GAME_STATS.idFromName('global-stats');
    const stub = c.env.GAME_STATS.get(id);
    const response = await stub.fetch(new Request('http://internal/stats'));
    return response;
  } catch (error) {
    console.error('Error fetching stats:', error);
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// GET /api/stats/ws - WebSocket endpoint for real-time stats updates
app.get('/api/stats/ws', async (c) => {
  try {
    // Check for WebSocket upgrade header
    const upgradeHeader = c.req.header('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return c.json(
        { error: 'Expected WebSocket upgrade request' },
        { status: 426, statusText: 'Upgrade Required' }
      );
    }

    // Forward the WebSocket upgrade request to the GameStatsStorage Durable Object
    const id = c.env.GAME_STATS.idFromName('global-stats');
    const stub = c.env.GAME_STATS.get(id);

    // Pass through the entire request (including headers for WebSocket upgrade)
    return await stub.fetch(c.req.raw);
  } catch (error) {
    console.error('Error upgrading WebSocket:', error);
    return c.json({ error: 'Failed to establish WebSocket connection' }, 500);
  }
});

// POST /api/stats/game-complete - Record completed game result
app.post('/api/stats/game-complete', async (c) => {
  try {
    const body = await c.req.json();
    const id = c.env.GAME_STATS.idFromName('global-stats');
    const stub = c.env.GAME_STATS.get(id);
    const response = await stub.fetch(
      new Request('http://internal/game-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    );
    return response;
  } catch (error) {
    console.error('Error recording game completion:', error);
    return c.json({ error: 'Failed to record game completion' }, 500);
  }
});

// 404 handler for unmatched routes
app.notFound((c) => {
  return c.json({ error: 'Not found', path: c.req.path }, 404);
});

// Error handler
app.onError((error, c) => {
  console.error('Worker error:', error);
  return c.json(
    {
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    },
    500
  );
});

export default app;
