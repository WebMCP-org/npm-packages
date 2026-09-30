import { useWebMCP } from 'usewebmcp';

export function App() {
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
      content: [{ type: 'text', text: `Hello ${args.name ?? 'world'}!` }],
    }),
  });

  return <p>WebMCP tool "say_hello" registered via useWebMCP.</p>;
}
