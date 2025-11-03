import { MyMCP } from './mcpServer';
export { MyMCP };

/**
 * Cloudflare Worker entry point
 * Routes requests to the appropriate MCP endpoints
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(request.url);

      // Route SSE (Server-Sent Events) endpoints
      if (url.pathname === '/sse' || url.pathname === '/sse/message') {
        return await MyMCP.serveSSE('/sse').fetch(request, env, ctx);
      }

      // Route MCP protocol endpoint
      if (url.pathname === '/mcp') {
        return await MyMCP.serve('/mcp').fetch(request, env, ctx);
      }

      // Return 404 for unmatched routes
      return new Response(JSON.stringify({ error: 'Not found', path: url.pathname }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      // Log error for debugging (visible in Cloudflare logs)
      console.error('Worker error:', error);

      // Return 500 error response
      return new Response(
        JSON.stringify({
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
