import { TabServerTransport } from '@mcp-b/transports';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'my-app', version: '1.0.0' });
const transport = new TabServerTransport({
  allowedOrigins: ['*'],
});

await server.connect(transport);
