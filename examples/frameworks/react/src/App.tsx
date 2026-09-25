import { installWebMCP } from '@mcp-b/webmcp-polyfill';
import { useEffect } from 'react';
import { useWebMCP } from 'usewebmcp';

export function App() {
  useEffect(() => {
    installWebMCP();
  }, []);

  useWebMCP({
    name: 'say_hello',
    description: 'Returns a hello message',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    },
    execute: async (args) => ({
      content: [{ type: 'text', text: `Hello ${args?.name ?? 'world'}!` }],
    }),
  });

  return <p>WebMCP tool "say_hello" registered via useWebMCP.</p>;
}
