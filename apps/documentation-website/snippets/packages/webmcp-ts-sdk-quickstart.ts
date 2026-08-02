import { TabServerTransport } from '@mcp-b/transports';
import { BrowserMcpServer } from '@mcp-b/webmcp-ts-sdk';

const server = new BrowserMcpServer({ name: 'my-web-app', version: '1.0.0' });
const transport = new TabServerTransport({ allowedOrigins: [window.location.origin] });

await server.connect(transport);

const controller = new AbortController();

await server.registerTool(
  {
    name: 'echo',
    description: 'Echo a message',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
      additionalProperties: false,
    },
    async execute({ message }) {
      return {
        content: [{ type: 'text', text: `Echo: ${String(message)}` }],
      };
    },
  },
  { signal: controller.signal }
);

controller.abort();
