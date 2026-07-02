import { TabServerTransport } from '@mcp-b/transports';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

const server = new BrowserMcpServer({ name: 'my-web-app', version: '1.0.0' });
const transport = new TabServerTransport({ allowedOrigins: ['*'] });

await server.connect(transport);

server.registerTool(
  'echo',
  {
    description: 'Echo a message',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
  },
  async ({ message }) => ({
    content: [{ type: 'text', text: `Echo: ${message}` }],
  })
);
