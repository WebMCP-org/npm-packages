import { useWebMCP } from 'usewebmcp';

export function CounterTool() {
  const counterTool = useWebMCP({
    name: 'counter_get',
    description: 'Get current count',
    inputSchema: { type: 'object', properties: {} } as const,
    execute: async () => ({ count: 42 }),
  });

  console.log(counterTool.state.lastResult);
  return null;
}
