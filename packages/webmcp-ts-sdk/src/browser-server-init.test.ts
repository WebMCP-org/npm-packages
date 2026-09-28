import { expect, it } from 'vitest';
import { BrowserMcpServer } from './index.js';

it('installs upstream for the existing constructor and reuses it across adapters', async () => {
  expect(document.modelContext).toBeUndefined();
  const server = new BrowserMcpServer({ name: 'automatic-context', version: '1.0.0' });
  const context = document.modelContext;
  if (!context) throw new Error('The constructor did not install WebMCP');
  const second = new BrowserMcpServer(
    { name: 'existing-context', version: '1.0.0' },
    { instructions: 'Use the existing page context' }
  );

  try {
    expect(document.modelContext).toBe(context);
    expect(context).not.toBe(server);
    await server.registerTool({
      name: 'echo',
      description: 'Uses the underlying WebMCP API',
      execute: (input) => input,
    });
    const tool = (await context.getTools()).find(({ name }) => name === 'echo');
    if (!tool) throw new Error('Tool was not registered with the upstream context');
    await expect(second.executeTool(tool, { message: 'hello' })).resolves.toBe(
      '{"message":"hello"}'
    );
  } finally {
    await second.close();
    await server.close();
  }

  expect(document.modelContext).toBe(context);
  await expect(context.getTools()).resolves.toEqual([]);
});
